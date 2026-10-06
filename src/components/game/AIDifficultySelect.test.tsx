import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_PRESET_COLORS, NEUTRAL_AI_TRAITS, createAISettings } from '@/types/ai';
import AIDifficultySelect from './AIDifficultySelect';

beforeEach(() => vi.stubGlobal('ResizeObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
}));
afterEach(() => vi.unstubAllGlobals());

function Harness() {
  const [settings, setSettings] = useState(createAISettings());
  return <AIDifficultySelect settings={settings} onChange={setSettings} automaticTraits={NEUTRAL_AI_TRAITS} onBack={vi.fn()} onConfirm={vi.fn()} />;
}
describe('AI difficulty controls', () => {
  it('starts at medium with four slider stops and collapsed options', () => {
    const { container } = render(<Harness />);
    const slider = screen.getByRole('slider', { name: '난이도' });
    expect(slider).toHaveAttribute('aria-valuemin', '0'); expect(slider).toHaveAttribute('aria-valuemax', '3');
    expect(slider).toHaveAttribute('aria-valuenow', '1'); expect(slider).toHaveAttribute('aria-valuetext', '중급');
    expect(container.ownerDocument.querySelector('details')).not.toHaveAttribute('open');
    expect(screen.getByRole('button', { name: '중급' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'AI 난이도 선택', level: 1 })).toBeInTheDocument();
  });
  it('switches presets by keyboard and exposes custom settings while preserving the last stop', () => {
    render(<Harness />);
    const slider = screen.getByRole('slider', { name: '난이도' });
    fireEvent.keyDown(slider, { key: 'End' });
    expect(slider).toHaveAttribute('aria-valuenow', '3'); expect(slider).toHaveAttribute('aria-valuetext', '완전');
    fireEvent.click(screen.getByText('세부 AI 옵션'));
    fireEvent.change(screen.getByLabelText('행동 평가값 노이즈'), { target: { value: '7' } });
    expect(slider).toHaveAttribute('aria-valuenow', '3'); expect(slider).toHaveAttribute('aria-valuetext', '사용자 지정');
    expect(screen.getByText('사용자 지정').closest('[data-difficulty]')).toHaveAttribute('data-difficulty', 'custom');
    fireEvent.click(screen.getByRole('button', { name: '중급' }));
    expect(screen.getByLabelText('행동 평가값 노이즈')).toHaveValue(12);
    expect(screen.getByText('반응 지연 175–225ms · 입력 정밀도 85–95%')).toBeInTheDocument();
  });
  it('keeps manual personality through preset changes without marking custom', () => {
    render(<Harness />); fireEvent.click(screen.getByText('세부 AI 옵션'));
    const aggression = screen.getByLabelText('공격성');
    expect(aggression).toBeDisabled();
    fireEvent.click(screen.getAllByRole('button', { name: '1배 고정' })[0]);
    fireEvent.change(aggression, { target: { value: '1.75' } });
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', '중급');
    fireEvent.click(screen.getByRole('button', { name: '상급' }));
    expect(aggression).toHaveValue(1.75); expect(aggression).not.toBeDisabled();
    expect(screen.getByText('상급', { selector: 'span' }).closest('[data-difficulty]')).toHaveAttribute('data-difficulty', 'hard');
    expect(AI_PRESET_COLORS.hard).toContain('linear-gradient');
    expect(AI_PRESET_COLORS.perfect).toContain('#1e40af');
    for (const color of Object.values(AI_PRESET_COLORS)) expect(color).toContain('linear-gradient');
    expect(AI_PRESET_COLORS.medium).toContain('#facc15');
  });
  it('routes explicit confirmation and back to the supplied actions', () => {
    const onBack = vi.fn(), onConfirm = vi.fn();
    render(<AIDifficultySelect settings={createAISettings()} onChange={vi.fn()} onBack={onBack} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: '맵 선택' })); expect(onConfirm).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: '캐릭터 다시 선택' })); expect(onBack).toHaveBeenCalledOnce();
  });
  it('exposes control adaptation under judgment and replaces it with presets', () => {
    render(<Harness />); fireEvent.click(screen.getByText('세부 AI 옵션'));
    const adaptation = screen.getByLabelText('조작 반전 대응력');
    expect(adaptation).toHaveValue(60);
    fireEvent.change(adaptation, { target: { value: '30' } });
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', '사용자 지정');
    fireEvent.click(screen.getByRole('button', { name: '하급' })); expect(adaptation).toHaveValue(25);
    fireEvent.click(screen.getByRole('button', { name: '상급' })); expect(adaptation).toHaveValue(100);
  });
  it('offers temporary memory and marks it as custom until a preset is selected', () => {
    render(<Harness />); fireEvent.click(screen.getByText('세부 AI 옵션'));
    const hidden = screen.getByLabelText('보이지 않는 대상 정보');
    fireEvent.change(hidden, { target: { value: 'temporary' } });
    expect(hidden).toHaveValue('temporary');
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', '사용자 지정');
    fireEvent.click(screen.getByRole('button', { name: '상급' })); expect(hidden).toHaveValue('remembered');
  });
});
