# Belka Portal Graph Digitizer - Setup Guide

## Overview

This solution extracts time-series data from Belka Portal device screenshots and converts them to JSON format for your coffee app integration.

## What's Included

### 1. Python Backend (`graph_digitizer.py`)
- **Image Processing**: Uses OpenCV to detect graph area, axes, and colored lines
- **Data Extraction**: Converts pixel coordinates to actual data values
- **Time Conversion**: Converts seconds to min:sec format
- **JSON Export**: Creates structured data for your coffee app

### 2. React Frontend (`src/components/GraphDigitizer.tsx`)
- **Image Upload**: Drag-and-drop interface for screenshots
- **Processing Interface**: Shows extraction progress
- **Data Display**: Table view of extracted data
- **Export Options**: Download as JSON or CSV

### 3. Flask Server (`backend_server.py`)
- **API Endpoints**: Handles image processing requests
- **CORS Support**: Enables frontend-backend communication
- **Error Handling**: Robust error management

## Quick Start

### 1. Install Python Dependencies

```bash
pip install -r requirements.txt
```

### 2. Start the Backend Server

```bash
python backend_server.py
```

The server will start at `http://localhost:5000`

### 3. Start the React Frontend

```bash
npm start
```

The frontend will be available at `http://localhost:5175`

### 4. Use the Digitizer

1. Open `http://localhost:5175` in your browser
2. Click the "Digitizer" tab
3. Upload a Belka Portal screenshot
4. Click "Extract Data"
5. Download the results as JSON or CSV

## How It Works

### Image Processing Pipeline

1. **Load Image**: Converts uploaded image to OpenCV format
2. **Preprocess**: Applies grayscale, blur, and contrast enhancement
3. **Detect Graph Area**: Finds the main plotting rectangle
4. **Calibrate Axes**: Determines pixel-to-data scale factors
5. **Extract Lines**: Uses color detection to find blue and orange lines
6. **Convert Coordinates**: Transforms pixels to data values
7. **Time Conversion**: Formats time as min:sec
8. **Export Data**: Creates structured JSON output

### Data Format

The extracted data follows this structure:

```json
{
  "metadata": {
    "source": "Belka Portal Screenshot",
    "extraction_method": "Graph Digitization",
    "timestamp": "2025-01-01T12:00:00Z",
    "units": {
      "x_axis": "seconds",
      "y_axis": "units (EC/Temp)"
    }
  },
  "time_series": {
    "blue_line": [
      {
        "time_seconds": 0,
        "time_formatted": "0:00",
        "value": 2.1
      }
    ],
    "orange_line": [
      {
        "time_seconds": 0,
        "time_formatted": "0:00",
        "value": 18.5
      }
    ]
  },
  "data_table": [
    {
      "time_seconds": 0,
      "time_formatted": "0:00",
      "blue_line_value": 2.1,
      "orange_line_value": 18.5
    }
  ]
}
```

## Integration with Coffee App

### Direct JSON Import

```javascript
// Load extracted data into your coffee app
fetch('belka_data_2025-01-01.json')
  .then(response => response.json())
  .then(data => {
    // Use data.time_series for plotting
    // Use data.data_table for tabular display
    // Combine with other coffee data points
  });
```

### Data Combination Example

```javascript
// Combine with existing coffee data
const coffeeData = {
  shot: {
    timestamp: "2025-01-01T12:00:00Z",
    beans: "Ethiopian Yirgacheffe",
    grind: "2.5",
    // Add Belka data
    ec_data: extractedData.time_series.blue_line,
    temp_data: extractedData.time_series.orange_line
  }
};
```

## Troubleshooting

### Common Issues

1. **Backend Won't Start**
   - Check Python version (3.7+ required)
   - Install all dependencies: `pip install -r requirements.txt`

2. **Frontend Can't Connect**
   - Ensure backend is running on port 5000
   - Check for CORS errors in browser console

3. **Poor Data Extraction**
   - Ensure screenshots are clear and high-quality
   - Graph area should be clearly visible
   - Blue and orange lines should be distinct

4. **Memory Issues**
   - Reduce image size before upload
   - Close other applications to free memory

### Improving Accuracy

1. **Image Quality**
   - Use high-resolution screenshots
   - Ensure good lighting and contrast
   - Avoid glare or reflections

2. **Graph Characteristics**
   - Clear axis labels and tick marks
   - Distinct colors for different lines
   - Minimal background noise

3. **Calibration**
   - Adjust scale factors in `graph_digitizer.py`
   - Fine-tune color detection ranges
   - Modify axis detection parameters

## Advanced Configuration

### Custom Color Detection

Edit the color ranges in `graph_digitizer.py`:

```python
# Blue line
blue_lower = np.array([100, 100, 100])
blue_upper = np.array([130, 255, 255])

# Orange line  
orange_lower = np.array([10, 100, 100])
orange_upper = np.array([25, 255, 255])
```

### Scale Adjustment

Modify the default scale factors:

```python
# Default scales (adjust based on your graphs)
x_scale = x_pixel_range / 200.0  # pixels per second
y_scale = y_pixel_range / 25.0   # pixels per unit
```

### Adding New Line Colors

Add additional color detection in `extract_colored_lines()`:

```python
# Add new color (e.g., green line)
green_lower = np.array([40, 100, 100])
green_upper = np.array([80, 255, 255])
green_mask = cv2.inRange(hsv, green_lower, green_upper)
green_data = self._extract_line_data(green_mask, 'green')
```

## Production Deployment

### Docker Setup

```dockerfile
FROM python:3.9-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .
EXPOSE 5000

CMD ["python", "backend_server.py"]
```

### Environment Variables

```bash
export FLASK_ENV=production
export PORT=5000
export DEBUG=False
```

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review the console logs for errors
3. Test with the provided sample images
4. Adjust parameters based on your specific graphs

---

**Ready to digitize your Belka Portal graphs! 🚀**
