import type { CSSProperties } from 'react';
import { CATEGORIES, categoryOf, weaponName } from '../data/weapons';
import { percent, type UsageRow } from '../lib/records';
import { WeaponIcon } from './ui';

/** ブキ別・カテゴリ別の使用数・使用率・勝率の表。total は使用率の分母 (のべ使用数) */
export function UsageTable({ rows, by, total }: { rows: UsageRow[]; by: 'weapon' | 'category'; total: number }) {
  const maxUses = rows[0]?.uses ?? 0;
  return (
    <div className="table-wrap">
      <table className="usage-table">
        <thead>
          <tr>
            <th>{by === 'weapon' ? 'ブキ' : 'カテゴリ'}</th>
            <th className="num">使用</th>
            <th>使用率</th>
            <th className="num">勝率</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const color = by === 'weapon' ? categoryOf(r.id)?.color : CATEGORIES.find((c) => c.id === r.id)?.color;
            return (
              <tr key={r.id} style={{ '--c': color } as CSSProperties}>
                <th>
                  <span className="usage-name">
                    {by === 'weapon' ? <WeaponIcon id={r.id} size={32} /> : <span className="usage-dot" />}
                    {by === 'weapon' ? weaponName(r.id) : CATEGORIES.find((c) => c.id === r.id)?.name}
                  </span>
                </th>
                <td className="num">{r.uses}</td>
                <td>
                  <span className="usage-rate">
                    <span className="usage-bar">
                      <span style={{ width: `${(r.uses / maxUses) * 100}%` }} />
                    </span>
                    <span className="usage-pct">{percent(r.uses, total)}</span>
                  </span>
                </td>
                <td className="num" title={`${r.wins}勝 / 勝敗入力済み ${r.decided}`}>
                  {percent(r.wins, r.decided)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
