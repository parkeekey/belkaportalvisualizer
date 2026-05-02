import React, { useState, useCallback } from 'react';
import { Upload, Download, Eye, AlertCircle, CheckCircle } from 'lucide-react';
import { ECGraph } from './ECGraph';

interface ExtractedData {
  metadata: {
    source: string;
    extraction_method: string;
    timestamp: string;
    units: {
      x_axis: string;
      y_axis: string;
    };
    note: string;
  };
  ec_time_series: Array<{
    time_seconds: number;
    time_formatted: string;
    ec_value: number;
  }>;
  data_table: Array<{
    time_seconds: number;
    time_formatted: string;
    ec_value: number;
  }>;
}

export const GraphDigitizer: React.FC = () => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<string>('');

  const handleImageUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file type
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file (PNG, JPG, etc.)');
      return;
    }

    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('File size must be less than 10MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setSelectedImage(e.target?.result as string);
      setError(null);
      setExtractedData(null);
    };
    reader.readAsDataURL(file);
  }, []);

  const processImage = useCallback(async () => {
    if (!selectedImage) return;

    setIsProcessing(true);
    setError(null);
    setProcessingStatus('Initializing digitizer...');

    try {
      // For future backend integration, we'll convert base64 to bytes here

      setProcessingStatus('Detecting graph area...');
      
      // For now, we'll simulate the processing
      // In a real implementation, you'd send this to a Python backend
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      setProcessingStatus('Extracting data points...');
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      setProcessingStatus('Converting coordinates...');
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Simulate extracted data (replace with actual backend call)
      const mockData: ExtractedData = {
        metadata: {
          source: 'Belka Portal Screenshot',
          extraction_method: 'EC Digitization',
          timestamp: new Date().toISOString(),
          units: {
            x_axis: 'seconds',
            y_axis: 'EC (μS/cm)'
          },
          note: 'Temperature data not extracted - different scale unknown'
        },
        ec_time_series: [
          { time_seconds: 0, time_formatted: '0:00', ec_value: 14.2 },
          { time_seconds: 30, time_formatted: '0:30', ec_value: 15.1 },
          { time_seconds: 60, time_formatted: '1:00', ec_value: 15.8 },
          { time_seconds: 90, time_formatted: '1:30', ec_value: 16.2 },
          { time_seconds: 120, time_formatted: '2:00', ec_value: 15.9 },
          { time_seconds: 150, time_formatted: '2:30', ec_value: 15.3 },
          { time_seconds: 180, time_formatted: '3:00', ec_value: 14.7 }
        ],
        data_table: [
          { time_seconds: 0, time_formatted: '0:00', ec_value: 14.2 },
          { time_seconds: 30, time_formatted: '0:30', ec_value: 15.1 },
          { time_seconds: 60, time_formatted: '1:00', ec_value: 15.8 },
          { time_seconds: 90, time_formatted: '1:30', ec_value: 16.2 },
          { time_seconds: 120, time_formatted: '2:00', ec_value: 15.9 },
          { time_seconds: 150, time_formatted: '2:30', ec_value: 15.3 },
          { time_seconds: 180, time_formatted: '3:00', ec_value: 14.7 }
        ]
      };

      setExtractedData(mockData);
      setProcessingStatus('Complete!');

    } catch (err) {
      setError('Failed to process image. Please try again.');
      console.error('Processing error:', err);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  }, [selectedImage]);

  const downloadJSON = useCallback(() => {
    if (!extractedData) return;

    const jsonString = JSON.stringify(extractedData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `belka_data_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [extractedData]);

  const downloadCSV = useCallback(() => {
    if (!extractedData) return;

    const csv = [
      'Time (seconds),Time (formatted),EC Value',
      ...extractedData.data_table.map(row => 
        `${row.time_seconds},${row.time_formatted},${row.ec_value}`
      )
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `belka_data_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [extractedData]);

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg">
        <div className="p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Belka Portal Graph Digitizer
          </h2>
          <p className="text-gray-600">
            Upload screenshots of your Belka Portal graphs to extract time-series data
          </p>
        </div>

        <div className="p-6">
          {/* Upload Section */}
          <div className="mb-6">
            <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Upload className="w-10 h-10 mb-3 text-gray-400" />
                <p className="mb-2 text-sm text-gray-500">
                  <span className="font-semibold">Click to upload</span> or drag and drop
                </p>
                <p className="text-xs text-gray-500">PNG, JPG, GIF up to 10MB</p>
              </div>
              <input
                type="file"
                className="hidden"
                accept="image/*"
                onChange={handleImageUpload}
                disabled={isProcessing}
              />
            </label>
          </div>

          {/* Error Display */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center">
              <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {/* Image Preview */}
          {selectedImage && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3">Uploaded Image</h3>
              <div className="border rounded-lg overflow-hidden max-w-2xl">
                <img 
                  src={selectedImage} 
                  alt="Belka Portal screenshot" 
                  className="w-full h-auto"
                />
              </div>
              
              <div className="mt-4 flex gap-4">
                <button
                  onClick={processImage}
                  disabled={isProcessing}
                  className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Eye className="w-4 h-4" />
                  {isProcessing ? 'Processing...' : 'Extract Data'}
                </button>
              </div>

              {/* Processing Status */}
              {isProcessing && (
                <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500 mr-2"></div>
                    <p className="text-blue-700">{processingStatus}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Extracted Data Display */}
          {extractedData && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold flex items-center">
                  <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
                  Extracted Data
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={downloadJSON}
                    className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download JSON
                  </button>
                  <button
                    onClick={downloadCSV}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download CSV
                  </button>
                </div>
              </div>

              {/* Interactive Graph */}
              <div className="bg-white rounded-lg shadow p-6">
                <h4 className="text-md font-semibold mb-4">Interactive Graph Visualization</h4>
                <ECGraph
                  ecData={extractedData.ec_time_series}
                />
              </div>

              {/* Data Table */}
              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-96 overflow-y-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Time
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          EC Value
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {extractedData.data_table.map((row, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {row.time_formatted}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {row.ec_value?.toFixed(2) || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Metadata */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-semibold mb-2">Extraction Metadata</h4>
                <div className="text-sm text-gray-600 space-y-1">
                  <p><strong>Source:</strong> {extractedData.metadata.source}</p>
                  <p><strong>Method:</strong> {extractedData.metadata.extraction_method}</p>
                  <p><strong>Timestamp:</strong> {new Date(extractedData.metadata.timestamp).toLocaleString()}</p>
                  <p><strong>Units:</strong> X: {extractedData.metadata.units.x_axis}, Y: {extractedData.metadata.units.y_axis}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
