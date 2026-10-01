import { useEffect, useState } from 'react';

// "#/teams/abc" -> ["teams", "abc"]。サーバー設定なしで GitHub Pages 等に置けるようハッシュで遷移する。
function parse(): string[] {
  return location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
}

export function useRoute(): string[] {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onChange = () => {
      setRoute(parse());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(...segments: string[]) {
  location.hash = '/' + segments.map(encodeURIComponent).join('/');
}
