// 戦績の金星 (優勝)・銀星 (準優勝)。表彰画像と同じく、2 個までは並べ、3 個以上は「★×n」にまとめる。

const COLORS = {
  gold: { fill: '#e2a92b', stroke: '#9a6b0c', label: '優勝' },
  silver: { fill: '#c3cad6', stroke: '#6f7889', label: '準優勝' },
};

function Star({ kind }: { kind: 'gold' | 'silver' }) {
  const c = COLORS[kind];
  return (
    <svg className="title-star" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 1.8l2.9 6.6 7.2.6-5.4 4.8 1.6 7.1L12 17.2l-6.3 3.7 1.6-7.1L1.9 9l7.2-.6z"
        fill={c.fill}
        stroke={c.stroke}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Group({ kind, n }: { kind: 'gold' | 'silver'; n: number }) {
  if (n <= 0) return null;
  return (
    <span className="title-star-group" title={`${COLORS[kind].label} ${n} 回`}>
      {n >= 3 ? (
        <>
          <Star kind={kind} />
          <span className="title-star-count">×{n}</span>
        </>
      ) : (
        Array.from({ length: n }, (_, i) => <Star key={i} kind={kind} />)
      )}
    </span>
  );
}

export function TitleStars({ gold, silver }: { gold: number; silver: number }) {
  if (gold + silver === 0) return null;
  return (
    <span className="title-stars" aria-label={`優勝 ${gold} 回・準優勝 ${silver} 回`}>
      <Group kind="gold" n={gold} />
      <Group kind="silver" n={silver} />
    </span>
  );
}
