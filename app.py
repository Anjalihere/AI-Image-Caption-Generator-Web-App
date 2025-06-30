from flask import Flask, render_template, request, jsonify, send_file
from werkzeug.utils import secure_filename
import os
import json
from datetime import datetime
import base64
from io import BytesIO
from PIL import Image
import numpy as np
import uuid
import sys

from tensorflow.keras.models import load_model
from tensorflow.keras.optimizers import Adam
from pickle import load
from tensorflow.keras.applications.xception import Xception
from tensorflow.keras.preprocessing.sequence import pad_sequences
from tensorflow.keras.preprocessing.text import tokenizer_from_json

# Add compatibility for older Keras models
import tensorflow.keras.preprocessing.text
import tensorflow.keras.preprocessing.sequence
import tensorflow.keras.preprocessing.image
import tensorflow.keras.utils

sys.modules['keras.preprocessing.text'] = tensorflow.keras.preprocessing.text
sys.modules['keras.preprocessing.sequence'] = tensorflow.keras.preprocessing.sequence
sys.modules['keras.preprocessing.image'] = tensorflow.keras.preprocessing.image
sys.modules['keras.utils'] = tensorflow.keras.utils

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# Create uploads directory if it doesn't exist
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# Global variables for model and tokenizer
model = None
tokenizer = None
xception_model = None
max_length = 32

def load_models():
    """Load the pre-trained models and tokenizer with compatibility handling"""
    global model, tokenizer, xception_model
    try:
        print("Loading models...")
        
        # Load tokenizer from JSON (compatible with newer TensorFlow)
        try:
            with open("tokenizer.json") as f:
                tokenizer_json = f.read()
            tokenizer = tokenizer_from_json(tokenizer_json)
            print("✅ Tokenizer loaded from JSON successfully!")
        except FileNotFoundError:
            # Fallback to pickle if JSON doesn't exist
            print("JSON tokenizer not found, trying pickle...")
            tokenizer = load(open("tokenizer.p", "rb"))
            print("✅ Tokenizer loaded from pickle successfully!")
        
        # Load model with custom_objects to handle optimizer compatibility
        custom_objects = {
            'Adam': Adam(learning_rate=0.001)  # Use learning_rate instead of lr
        }
        
        model = load_model('models/model_9.h5', custom_objects=custom_objects, compile=False)
        
        # Recompile the model with current optimizer
        model.compile(optimizer=Adam(learning_rate=0.001), loss='categorical_crossentropy')
        
        # Load Xception model
        xception_model = Xception(include_top=False, pooling="avg")
        
        print("✅ Models loaded successfully!")
    except Exception as e:
        print(f"Error loading models: {e}")
        # Try alternative loading method
        try:
            print("Trying alternative loading method...")
            model = load_model('models/model_9.h5', compile=False)
            model.compile(optimizer='adam', loss='categorical_crossentropy')
            print("Models loaded with alternative method!")
        except Exception as e2:
            print(f"Alternative loading also failed: {e2}")
            raise e2

def extract_features(image_path, model):
    """Extract features from image using Xception model"""
    try:
        image = Image.open(image_path)
        image = image.resize((299, 299))
        image = np.array(image)
        
        # Convert 4-channel images to 3 channels
        if len(image.shape) == 3 and image.shape[2] == 4:
            image = image[..., :3]
        
        image = np.expand_dims(image, axis=0)
        image = image / 127.5
        image = image - 1.0
        feature = model.predict(image, verbose=0)
        return feature
    except Exception as e:
        print(f"Error extracting features: {e}")
        return None

def word_for_id(integer, tokenizer):
    """Convert integer back to word using index_word"""
    return tokenizer.index_word.get(integer, None)

def generate_caption(model, tokenizer, photo, max_length):
    """Generate caption for the given image features"""
    try:
        in_text = 'start'
        for i in range(max_length):
            sequence = tokenizer.texts_to_sequences([in_text])[0]
            sequence = pad_sequences([sequence], maxlen=max_length)
            pred = model.predict([photo, sequence], verbose=0)
            pred = np.argmax(pred)
            word = word_for_id(pred, tokenizer)
            
            if word is None:
                break
            in_text += ' ' + word
            if word == 'end':
                break
        
        # Clean up the caption
        caption = in_text.replace('start', '').replace('end', '').strip()
        return caption
    except Exception as e:
        print(f"Error generating caption: {e}")
        return "Error generating caption"

def save_to_history(image_data, caption):
    """Save the image and caption to history"""
    try:
        history_file = 'history.json'
        history = []
        
        # Load existing history
        if os.path.exists(history_file):
            with open(history_file, 'r') as f:
                history = json.load(f)
        
        # Add new entry
        entry = {
            'id': str(uuid.uuid4()),
            'timestamp': datetime.now().isoformat(),
            'image_data': image_data,
            'caption': caption
        }
        
        history.append(entry)
        
        # Keep only last 20 entries
        if len(history) > 20:
            history = history[-20:]
        
        # Save updated history
        with open(history_file, 'w') as f:
            json.dump(history, f)
        
        return entry['id']
    except Exception as e:
        print(f"Error saving to history: {e}")
        return None

@app.route('/')
def index():
    """Main page"""
    return render_template('index.html')

@app.route('/generate_caption', methods=['POST'])
def generate_caption_api():
    """API endpoint to generate caption for uploaded image"""
    try:
        if 'image' not in request.files:
            return jsonify({'error': 'No image uploaded'}), 400
        
        file = request.files['image']
        if file.filename == '':
            return jsonify({'error': 'No image selected'}), 400
        
        # Save uploaded file
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        # Extract features
        photo = extract_features(filepath, xception_model)
        if photo is None:
            return jsonify({'error': 'Error processing image'}), 500
        
        # Generate caption
        caption = generate_caption(model, tokenizer, photo, max_length)
        
        # Convert image to base64 for frontend display
        with open(filepath, 'rb') as img_file:
            img_data = base64.b64encode(img_file.read()).decode('utf-8')
        
        # Save to history
        history_id = save_to_history(img_data, caption)
        
        # Clean up uploaded file
        os.remove(filepath)
        
        return jsonify({
            'caption': caption,
            'image_data': img_data,
            'history_id': history_id
        })
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/download_caption/<history_id>')
def download_caption(history_id):
    """Download caption as text file"""
    try:
        history_file = 'history.json'
        if os.path.exists(history_file):
            with open(history_file, 'r') as f:
                history = json.load(f)
            
            entry = next((item for item in history if item['id'] == history_id), None)
            if entry:
                caption_text = f"Generated Caption:\n{entry['caption']}\n\nGenerated on: {entry['timestamp']}"
                
                # Create text file in memory
                from io import StringIO
                output = StringIO()
                output.write(caption_text)
                output.seek(0)
                
                return send_file(
                    BytesIO(output.getvalue().encode('utf-8')),
                    mimetype='text/plain',
                    as_attachment=True,
                    download_name=f'caption_{history_id[:8]}.txt'
                )
        
        return jsonify({'error': 'Caption not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/history', methods=['GET', 'DELETE'])
def get_history():
    """Get history of generated captions or clear history"""
    try:
        history_file = 'history.json'
        
        if request.method == 'DELETE':
            # Clear history by writing empty array
            with open(history_file, 'w') as f:
                json.dump([], f)
            return jsonify({'message': 'History cleared successfully'})
        
        # GET method - return history
        if os.path.exists(history_file):
            with open(history_file, 'r') as f:
                history = json.load(f)
            return jsonify(history)
        return jsonify([])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    load_models()
    app.run(debug=True, host='0.0.0.0', port=5000)
