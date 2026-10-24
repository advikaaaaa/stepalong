// Builds the app as one HTML string for jsdom: index.html with app.js inlined.
// (jsdom doesn't fetch external files here. The MediaPipe CDN scripts are skipped too;
// each test supplies its own fake Pose, or none to simulate a model-load failure.)
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

module.exports = function loadApp() {
  const appJs = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  if (!html.includes('<script src="app.js"></script>')) throw new Error('index.html no longer loads app.js; update tests/load-app.js');
  return html.replace('<script src="app.js"></script>', () => '<script>\n' + appJs + '\n</script>');
};
