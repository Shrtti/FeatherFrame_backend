// Temporary mock implementation without TensorFlow.js
const identifyBird = async (imageBuffer) => {
  // Mock implementation that returns a placeholder response
  return {
    identified: false,
    predictions: [],
    confidence: 0
  };
};

module.exports = {
  identifyBird
}; 