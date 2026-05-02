"""
Test script for Belka Portal digitizer with calibration options
"""

import cv2
import numpy as np
from graph_digitizer import BelkaGraphDigitizer

def test_digitizer_with_calibration():
    """Test the digitizer with manual calibration options"""
    
    # Create digitizer
    digitizer = BelkaGraphDigitizer()
    
    # Calibration parameters (adjust based on your specific graph)
    calibration = {
        'x_range': (0, 180),    # Time range in seconds
        'y_range': (0, 20),     # Value range 
        'blue_hsv_range': {
            'lower': [90, 80, 80],
            'upper': [140, 255, 255]
        },
        'orange_hsv_range': {
            'lower': [5, 80, 80],
            'upper': [35, 255, 255]
        }
    }
    
    print("Belka Portal Digitizer Test")
    print("=" * 40)
    print(f"Calibration settings:")
    print(f"  X-axis range: {calibration['x_range'][0]}-{calibration['x_range'][1]} seconds")
    print(f"  Y-axis range: {calibration['y_range'][0]}-{calibration['y_range'][1]} units")
    print(f"  Blue HSV range: {calibration['blue_hsv_range']}")
    print(f"  Orange HSV range: {calibration['orange_hsv_range']}")
    print()
    
    # Test with a sample image (you would replace this with your actual image)
    image_path = "belka_screenshot.png"  # Replace with your image path
    
    try:
        # Load image
        if digitizer.load_image(image_path):
            print("✓ Image loaded successfully")
            
            # Override scale factors with calibrated values
            digitizer.detect_graph_area()
            x1, y1, x2, y2 = digitizer.axis_bounds
            
            x_pixel_range = x2 - x1
            y_pixel_range = y2 - y1
            
            # Use calibrated ranges
            x_scale = x_pixel_range / (calibration['x_range'][1] - calibration['x_range'][0])
            y_scale = y_pixel_range / (calibration['y_range'][1] - calibration['y_range'][0])
            
            digitizer.scale_factors = {
                'x_scale': x_scale,
                'y_scale': y_scale,
                'x_offset': x1,
                'y_offset': y2
            }
            
            print(f"✓ Scale calibration applied:")
            print(f"  X-scale: {x_scale:.2f} pixels/second")
            print(f"  Y-scale: {y_scale:.2f} pixels/unit")
            
            # Extract data with improved color ranges
            hsv = cv2.cvtColor(digitizer.image, cv2.COLOR_BGR2HSV)
            
            # Use calibrated color ranges
            blue_lower = np.array(calibration['blue_hsv_range']['lower'])
            blue_upper = np.array(calibration['blue_hsv_range']['upper'])
            orange_lower = np.array(calibration['orange_hsv_range']['lower'])
            orange_upper = np.array(calibration['orange_hsv_range']['upper'])
            
            blue_mask = cv2.inRange(hsv, blue_lower, blue_upper)
            orange_mask = cv2.inRange(hsv, orange_lower, orange_upper)
            
            # Extract data
            blue_data = digitizer._extract_line_data(blue_mask, 'blue')
            orange_data = digitizer._extract_line_data(orange_mask, 'orange')
            
            digitizer.extracted_data = {
                'blue_line': blue_data,
                'orange_line': orange_data
            }
            
            print(f"✓ Data extracted:")
            print(f"  Blue line points: {len(blue_data)}")
            print(f"  Orange line points: {len(orange_data)}")
            
            # Show sample values
            if blue_data:
                print(f"  Blue line sample values:")
                for i, (time, value) in enumerate(blue_data[:5]):
                    print(f"    {i+1}. Time: {time:.1f}s, Value: {value:.2f}")
            
            if orange_data:
                print(f"  Orange line sample values:")
                for i, (time, value) in enumerate(orange_data[:5]):
                    print(f"    {i+1}. Time: {time:.1f}s, Value: {value:.2f}")
            
            # Export to JSON
            json_data = digitizer.export_to_json("test_output.json")
            print(f"✓ Data exported to test_output.json")
            
            return True
            
        else:
            print("✗ Failed to load image")
            return False
            
    except Exception as e:
        print(f"✗ Error: {e}")
        return False

def analyze_color_ranges():
    """Analyze actual colors in your Belka Portal screenshot"""
    image_path = "belka_screenshot.png"  # Replace with your image path
    
    try:
        # Load image
        image = cv2.imread(image_path)
        if image is None:
            print(f"Could not load {image_path}")
            return
        
        # Convert to HSV
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        
        # Sample some blue and orange pixels manually
        # You would click on actual blue and orange line pixels
        # For now, let's analyze the color distribution
        
        print("Color Analysis for Calibration")
        print("=" * 40)
        print("To improve accuracy, manually sample colors from your graph:")
        print("1. Open your screenshot in an image editor")
        print("2. Use color picker to get HSV values from blue line")
        print("3. Use color picker to get HSV values from orange line")
        print("4. Update the calibration ranges in test_digitizer.py")
        print()
        print("Current ranges (may need adjustment):")
        print("Blue: H=90-140, S=80-255, V=80-255")
        print("Orange: H=5-35, S=80-255, V=80-255")
        
    except Exception as e:
        print(f"Error analyzing colors: {e}")

if __name__ == "__main__":
    print("Choose an option:")
    print("1. Test digitizer with calibration")
    print("2. Analyze color ranges")
    
    choice = input("Enter choice (1 or 2): ").strip()
    
    if choice == "1":
        test_digitizer_with_calibration()
    elif choice == "2":
        analyze_color_ranges()
    else:
        print("Invalid choice")
