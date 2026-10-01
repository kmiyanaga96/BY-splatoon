import { useState } from 'react';
import { updatePlayer } from '../store';
import type { Player } from '../types';
import { AvatarInput } from './AvatarInput';
import { Field, Icon, WeaponTag } from './ui';
import { WeaponPicker } from './WeaponPicker';

/** 選手 DB の項目 (アイコン・名前・XP・メモ・得意ブキ) の編集欄。ここでの変更は全大会で共通 */
export function PlayerProfileFields({ player: p, color }: { player: Player; color: string }) {
  const [picking, setPicking] = useState(false);
  const edit = (fn: (p: Player) => void) => updatePlayer(p.id, fn);

  return (
    <>
      <div className="player-identity">
        <AvatarInput name={p.name} color={color} value={p.avatar} onChange={(v) => edit((y) => void (y.avatar = v))} />
      </div>
      <div className="form-row">
        <Field label="名前">
          <input className="input" value={p.name} onChange={(e) => edit((y) => void (y.name = e.target.value))} />
        </Field>
        <Field label="Xパワー" hint="2500以上でバッジ">
          <input
            className="input"
            type="number"
            inputMode="numeric"
            min={0}
            max={5000}
            placeholder="例: 2650"
            value={p.xp ?? ''}
            onChange={(e) =>
              edit((y) => {
                const v = e.target.value === '' ? null : Number(e.target.value);
                y.xp = v != null && Number.isFinite(v) ? v : null;
              })
            }
          />
        </Field>
      </div>
      <div className="form-row">
        <Field label="Discord の名前">
          <input
            className="input"
            placeholder="任意"
            value={p.discord}
            onChange={(e) => edit((y) => void (y.discord = e.target.value))}
          />
        </Field>
        <Field label="ウデマエ・メモ">
          <input
            className="input"
            placeholder="例: S+10 / 最高XP2800"
            value={p.note}
            onChange={(e) => edit((y) => void (y.note = e.target.value))}
          />
        </Field>
      </div>
      <div className="tags">
        <span className="label">得意ブキ</span>
        {p.mains.map((w) => (
          <WeaponTag key={w} id={w} onRemove={() => edit((y) => void (y.mains = y.mains.filter((m) => m !== w)))} />
        ))}
        <button className="btn text small" onClick={() => setPicking(true)}>
          <Icon name="add" />
          選ぶ
        </button>
      </div>
      {picking && (
        <WeaponPicker
          title={`${p.name || '選手'} の得意ブキ`}
          selected={p.mains}
          max={3}
          onChange={(ids) => edit((y) => void (y.mains = ids))}
          onClose={() => setPicking(false)}
        />
      )}
    </>
  );
}
