import google.generativeai as genai

# Your API Key
GOOGLE_API_KEY = "AIzaSyClxaeWVdWmrf66IwKYcDbyqdto96PGZac"
genai.configure(api_key=GOOGLE_API_KEY)

print("--- SEARCHING FOR AVAILABLE MODELS ---")
try:
    for m in genai.list_models():
        if 'generateContent' in m.supported_generation_methods:
            print(f"FOUND: {m.name}")
except Exception as e:
    print(f"Error: {e}")
print("--------------------------------------")