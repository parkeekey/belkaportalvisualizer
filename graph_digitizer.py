"""
Graph Digitizer for Belka Portal Screenshots
Extracts time-series data from graph images and converts to JSON format
"""

import cv2
import numpy as np
import json
import pandas as pd
from typing import List, Tuple, Dict, Optional
import matplotlib.pyplot as plt
from PIL import Image
import io
import base64

class BelkaGraphDigitizer:
    def __init__(self):
        self.image = None
        self.processed_image = None
        self.axis_bounds = None
        self.scale_factors = None
        self.extracted_data = {}
        
    def load_image(self, image_path: str) -> bool:
        """Load image from file path"""
        try:
            self.image = cv2.imread(image_path)
            if self.image is None:
                raise ValueError("Could not load image")
            return True
        except Exception as e:
            print(f"Error loading image: {e}")
            return False
    
    def load_image_from_bytes(self, image_bytes: bytes) -> bool:
        """Load image from bytes (for web upload)"""
        try:
            nparr = np.frombuffer(image_bytes, np.uint8)
            self.image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if self.image is None:
                raise ValueError("Could not decode image")
            return True
        except Exception as e:
            print(f"Error loading image from bytes: {e}")
            return False
    
    def preprocess_image(self):
        """Preprocess image for better line detection"""
        # Convert to grayscale
        gray = cv2.cvtColor(self.image, cv2.COLOR_BGR2GRAY)
        
        # Apply Gaussian blur to reduce noise
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        
        # Enhance contrast
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(blurred)
        
        self.processed_image = enhanced
        return enhanced
    
    def detect_graph_area(self) -> Tuple[int, int, int, int]:
        """
        Detect the main graph plotting area
        Returns: (x1, y1, x2, y2) coordinates of graph area
        """
        # Convert to grayscale for edge detection
        gray = cv2.cvtColor(self.image, cv2.COLOR_BGR2GRAY)
        
        # Apply Canny edge detection
        edges = cv2.Canny(gray, 50, 150)
        
        # Find contours
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        # Find the largest rectangular contour (likely the graph area)
        largest_area = 0
        graph_rect = None
        
        for contour in contours:
            # Approximate contour to polygon
            epsilon = 0.02 * cv2.arcLength(contour, True)
            approx = cv2.approxPolyDP(contour, epsilon, True)
            
            # Check if it's roughly rectangular
            if len(approx) == 4:
                area = cv2.contourArea(contour)
                if area > largest_area:
                    largest_area = area
                    graph_rect = cv2.boundingRect(contour)
        
        if graph_rect is None:
            # Fallback: use image dimensions with some padding
            h, w = self.image.shape[:2]
            graph_rect = (int(w*0.1), int(h*0.1), int(w*0.9), int(h*0.9))
        
        self.axis_bounds = graph_rect
        return graph_rect
    
    def detect_axes_scale(self) -> Dict[str, float]:
        """
        Detect scale factors for X and Y axes
        Returns dictionary with 'x_scale' and 'y_scale' (pixels per unit)
        """
        if self.axis_bounds is None:
            self.detect_graph_area()
        
        x1, y1, x2, y2 = self.axis_bounds
        
        # For Belka Portal graphs, adjust ranges based on typical values
        # X-axis: 0-180 seconds (3 minutes typical shot)
        # Y-axis: 0-20 units (EC typically ranges 0-20, temp 0-100 but on same scale)
        # These ranges can be further refined with OCR
        
        x_pixel_range = x2 - x1
        y_pixel_range = y2 - y1
        
        # Updated scales for better accuracy
        x_scale = x_pixel_range / 180.0  # pixels per second (3 minutes)
        y_scale = y_pixel_range / 20.0   # pixels per unit
        
        self.scale_factors = {
            'x_scale': x_scale,
            'y_scale': y_scale,
            'x_offset': x1,
            'y_offset': y2  # Y is inverted in image coordinates
        }
        
        return self.scale_factors
    
    def detect_y_axis_range(self) -> Tuple[float, float]:
        """
        Detect actual Y-axis range by reading tick marks
        Returns: (y_min, y_max)
        """
        if self.axis_bounds is None:
            self.detect_graph_area()
        
        x1, y1, x2, y2 = self.axis_bounds
        
        # Extract the left area of the graph where Y-axis labels are
        y_axis_region = self.image[y1:y2, max(0, x1-50):x1]
        
        # Convert to grayscale for OCR
        gray = cv2.cvtColor(y_axis_region, cv2.COLOR_BGR2GRAY)
        
        # For now, return typical ranges based on coffee extraction
        # EC typically ranges 0-20, temperature might be 0-100 but scaled
        # This can be enhanced with OCR in the future
        return (0.0, 20.0)
    
    def extract_ec_line(self) -> List[Tuple[float, float]]:
        """
        Extract EC (blue line) data points only
        Returns list of (time, ec_value) tuples
        """
        if self.processed_image is None:
            self.preprocess_image()
        
        if self.scale_factors is None:
            self.detect_axes_scale()
        
        # Convert BGR to HSV for better color detection
        hsv = cv2.cvtColor(self.image, cv2.COLOR_BGR2HSV)
        
        # Focus on blue line detection only - optimized for EC
        blue_lower = np.array([90, 80, 80])
        blue_upper = np.array([140, 255, 255])
        
        # Create mask for blue line
        blue_mask = cv2.inRange(hsv, blue_lower, blue_upper)
        
        # Extract EC data points
        ec_data = self._extract_line_data(blue_mask, 'ec')
        
        self.extracted_data = ec_data
        return ec_data
    
    def _extract_line_data(self, mask: np.ndarray, line_name: str) -> List[Tuple[float, float]]:
        """Extract data points from a single colored line"""
        x1, y1, x2, y2 = self.axis_bounds
        x_scale = self.scale_factors['x_scale']
        y_scale = self.scale_factors['y_scale']
        x_offset = self.scale_factors['x_offset']
        y_offset = self.scale_factors['y_offset']
        
        data_points = []
        
        # Sample points along the line
        for x in range(x1, x2, 2):  # Sample every 2 pixels
            # Find the y-coordinate of the line at this x position
            column = mask[:, x]
            
            # Find the most significant y-value in this column
            y_indices = np.where(column > 0)[0]
            
            if len(y_indices) > 0:
                # Take the median y-value to reduce noise
                y = int(np.median(y_indices))
                
                # Convert pixel coordinates to data coordinates
                data_x = (x - x_offset) / x_scale
                data_y = (y_offset - y) / y_scale  # Y is inverted
                
                # Filter out points outside reasonable ranges (updated scales)
                if 0 <= data_x <= 180 and 0 <= data_y <= 20:
                    data_points.append((data_x, data_y))
        
        # Sort by x-coordinate and smooth the data
        data_points.sort(key=lambda p: p[0])
        
        # Apply simple moving average to reduce noise
        if len(data_points) > 3:
            smoothed_points = []
            for i in range(len(data_points)):
                if i == 0 or i == len(data_points) - 1:
                    smoothed_points.append(data_points[i])
                else:
                    # Average with neighbors
                    avg_x = (data_points[i-1][0] + data_points[i][0] + data_points[i+1][0]) / 3
                    avg_y = (data_points[i-1][1] + data_points[i][1] + data_points[i+1][1]) / 3
                    smoothed_points.append((avg_x, avg_y))
            data_points = smoothed_points
        
        return data_points
    
    def seconds_to_min_sec(self, seconds: float) -> str:
        """Convert seconds to min:sec format"""
        minutes = int(seconds // 60)
        secs = int(seconds % 60)
        return f"{minutes}:{secs:02d}"
    
    def export_to_json(self, output_path: str = None) -> Dict:
        """Export extracted EC data to JSON format"""
        if not self.extracted_data:
            self.extract_ec_line()
        
        # Convert to coffee app friendly format (EC only)
        json_data = {
            'metadata': {
                'source': 'Belka Portal Screenshot',
                'extraction_method': 'EC Digitization',
                'timestamp': pd.Timestamp.now().isoformat(),
                'units': {
                    'x_axis': 'seconds',
                    'y_axis': 'EC (μS/cm)'
                },
                'note': 'Temperature data not extracted - different scale unknown'
            },
            'ec_time_series': []
        }
        
        # Process EC data
        for time_sec, ec_value in self.extracted_data:
            json_data['ec_time_series'].append({
                'time_seconds': round(time_sec, 2),
                'time_formatted': self.seconds_to_min_sec(time_sec),
                'ec_value': round(ec_value, 3)
            })
        
        # Create simple data table
        json_data['data_table'] = []
        for time_sec, ec_value in self.extracted_data:
            json_data['data_table'].append({
                'time_seconds': round(time_sec, 2),
                'time_formatted': self.seconds_to_min_sec(time_sec),
                'ec_value': round(ec_value, 3)
            })
        
        # Save to file if path provided
        if output_path:
            with open(output_path, 'w') as f:
                json.dump(json_data, f, indent=2)
        
        return json_data
    
        
        
    def visualize_extraction(self, save_path: str = None):
        """Create a visualization of the extracted EC data"""
        if not self.extracted_data:
            self.extract_ec_line()
        
        plt.figure(figsize=(12, 8))
        
        # Plot original image in background
        plt.imshow(cv2.cvtColor(self.image, cv2.COLOR_BGR2RGB), alpha=0.3)
        
        # Plot extracted EC data
        if self.extracted_data:
            x_coords = [p[0] for p in self.extracted_data]
            y_coords = [p[1] for p in self.extracted_data]
            plt.plot(x_coords, y_coords, 'o-', 
                    color='blue', 
                    label='Extracted EC Line',
                    linewidth=2, markersize=3)
        
        plt.xlabel('Time (seconds)')
        plt.ylabel('EC (μS/cm)')
        plt.title('Belka Portal Graph - Extracted EC Data Only')
        plt.legend()
        plt.grid(True, alpha=0.3)
        
        if save_path:
            plt.savefig(save_path, dpi=300, bbox_inches='tight')
        
        plt.show()

# Example usage
def main():
    digitizer = BelkaGraphDigitizer()
    
    # Load image (replace with your screenshot path)
    if digitizer.load_image("belka_screenshot.png"):
        print("Image loaded successfully")
        
        # Extract data
        data = digitizer.extract_colored_lines()
        print(f"Extracted {len(data)} lines")
        
        # Export to JSON
        json_data = digitizer.export_to_json("extracted_data.json")
        print("Data exported to JSON")
        
        # Visualize results
        digitizer.visualize_extraction("extraction_result.png")
        print("Visualization saved")

if __name__ == "__main__":
    main()
