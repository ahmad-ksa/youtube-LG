// Runs from file:// when the app starts: jump to a bare youtube.com page where our user script takes over.
(function () {
  var hash = '#ytlg';
  try {
    var p = JSON.parse((window.PalmSystem && window.PalmSystem.launchParams) || '{}');
    var t = p.contentTarget || p.target || '';
    var m = String(t).match(/(?:v=|youtu\.be\/)([\w-]{11})/);
    if (m) hash += '&v=' + m[1];
  } catch (e) { /* no params */ }
  window.location.href = 'https://www.youtube.com/robots.txt' + hash;
})();
