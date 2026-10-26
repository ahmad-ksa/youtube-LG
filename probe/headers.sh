for u in https://www.youtube.com/tv https://www.youtube.com/robots.txt https://www.youtube.com/ ; do
  echo "== $u"; curl -s -D - -o /dev/null -A "Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.5359.211 Safari/537.36 WebAppManager" "$u" | grep -i -E "^HTTP|content-security|content-type|trusted|cross-origin" 
done
echo "== googlevideo CORS preflight"
curl -s -D - -o /dev/null -X OPTIONS -H "Origin: https://www.youtube.com" -H "Access-Control-Request-Method: POST" "https://rr1---sn-a5mekn6z.googlevideo.com/videoplayback" | grep -i "^HTTP\|access-control"
