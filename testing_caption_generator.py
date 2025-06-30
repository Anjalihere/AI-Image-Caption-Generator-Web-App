import sys
import argparse
import numpy as np
from PIL import Image
import matplotlib.pyplot as plt
import pickle
import json
import tensorflow.keras.preprocessing.text
import tensorflow.keras.preprocessing.sequence
import tensorflow.keras.preprocessing.image
import tensorflow.keras.utils
from tensorflow.keras.preprocessing.text import Tokenizer, tokenizer_from_json
from tensorflow.keras.models import load_model
from tensorflow.keras.optimizers import Adam
from tensorflow.keras.applications.xception import Xception, preprocess_input
from tensorflow.keras.preprocessing.sequence import pad_sequences

sys.modules['keras.preprocessing.text']     = tensorflow.keras.preprocessing.text
sys.modules['keras.preprocessing.sequence'] = tensorflow.keras.preprocessing.sequence
sys.modules['keras.preprocessing.image']    = tensorflow.keras.preprocessing.image
sys.modules['keras.utils']                  = tensorflow.keras.utils                  


# --- Argument Parsing ---
ap = argparse.ArgumentParser()
ap.add_argument('-i', '--image', required=True, help="Image Path")
args = vars(ap.parse_args())
img_path = args['image']

# --- Feature Extraction ---
def extract_features(filename, model):
    try:
        image = Image.open(filename)
    except Exception as e:
        raise ValueError(f"ERROR: Couldn't open image! {e}")
    image = image.resize((299, 299))
    image = np.array(image)
    if image.shape[2] == 4:  # Convert RGBA to RGB
        image = image[..., :3]
    image = np.expand_dims(image, axis=0)
    image = image / 127.5 - 1.0
    feature = model.predict(image)
    return feature

# --- Description Generation ---
def generate_desc(model, tokenizer, photo, max_length):
    in_text = 'start'
    for _ in range(max_length):
        sequence = tokenizer.texts_to_sequences([in_text])[0]
        sequence = pad_sequences([sequence], maxlen=max_length)
        yhat = model.predict([photo, sequence], verbose=0)
        yhat = np.argmax(yhat)
        word = tokenizer.index_word.get(yhat, None)
        if word is None:
            break
        in_text += ' ' + word
        if word == 'end':
            break
    return in_text

with open("tokenizer.json") as f:
    tokenizer_json = f.read()
tokenizer = tokenizer_from_json(tokenizer_json) 

# --- Load Model ---
model = load_model('models/model_9.h5', compile=False)

# --- Load Feature Extractor ---
xception_model = Xception(include_top=False, pooling="avg")

# --- Run Inference ---
photo = extract_features(img_path, xception_model)
img = Image.open(img_path)
description = generate_desc(model, tokenizer, photo, max_length=32)

# --- Display ---
print("\nGenerated Caption:\n", description)
plt.imshow(img)
plt.axis('off')
plt.show()
