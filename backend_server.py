"""
Simple Flask backend for Belka Portal graph digitization
"""

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import base64
import io
import cv2
import numpy as np
import json
from graph_digitizer import BelkaGraphDigitizer
import tempfile
import os

app = Flask(__name__)
CORS(app)  # Enable CORS for React frontend

@app.route('/api/digitize', methods=['POST'])
def digitize_image():
    """Process uploaded image and extract graph data"""
    try:
        # Get image data from request
        data = request.get_json()
        if not data or 'image' not in data:
            return jsonify({'error': 'No image data provided'}), 400
        
        # Decode base64 image
        image_data = data['image']
        image_data = image_data.split(',')[1]  # Remove data URL prefix
        image_bytes = base64.b64decode(image_data)
        
        # Create digitizer and process image
        digitizer = BelkaGraphDigitizer()
        
        if not digitizer.load_image_from_bytes(image_bytes):
            return jsonify({'error': 'Failed to load image'}), 400
        
        # Extract EC data only
        extracted_data = digitizer.extract_ec_line()
        json_output = digitizer.export_to_json()
        
        return jsonify({
            'success': True,
            'data': json_output
        })
        
    except Exception as e:
        print(f"Error processing image: {e}")
        return jsonify({'error': f'Processing failed: {str(e)}'}), 500

@app.route('/api/test', methods=['GET'])
def test_endpoint():
    """Test endpoint to verify backend is running"""
    return jsonify({
        'message': 'Belka Portal digitizer backend is running',
        'status': 'healthy'
    })

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'ok'})

if __name__ == '__main__':
    print("Starting Belka Portal digitizer backend...")
    print("Available endpoints:")
    print("  POST /api/digitize - Upload and process graph images")
    print("  GET  /api/test    - Test backend connection")
    print("  GET  /health      - Health check")
    print("\nBackend will be available at: http://localhost:5000")
    
    app.run(debug=True, host='0.0.0.0', port=5000)
