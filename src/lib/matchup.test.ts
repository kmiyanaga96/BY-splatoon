import { describe, expect, it } from 'vitest';
import { buildMatchupContext, matchupPrompt } from './matchup';

describe('マッチアップ分析の下準備', () => {
  it('ブキ名と戦術データをまとめ、指示文に味方・相手の全員を入れる', () => {
    const ctx = buildMatchupContext({
      rule: 'エリア',
      allies: ['Shooter_Normal_00', 'Charger_Long_00', 'Saber_Normal_00', 'Roller_Normal_00'],
      enemies: ['Shooter_Gravity_00', 'Spinner_Hyper_00', 'Brush_Mini_00', 'Slosher_Strong_00'],
    });
    expect(ctx.allies[1].name).toBe('リッター4K');
    const prompt = matchupPrompt(ctx);
    expect(prompt).toContain('エリア の対抗戦');
    for (const w of [...ctx.allies, ...ctx.enemies]) expect(prompt).toContain(`- ${w.name}:`);
  });
});
