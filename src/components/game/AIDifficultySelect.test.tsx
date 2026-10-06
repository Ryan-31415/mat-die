import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_PRESET_COLORS, NEUTRAL_AI_TRAITS, AI_ESTIMATION_LABELS, AI_FORECAST_LABELS, AI_INPUT_LABELS, createAISettings } from '@/types/ai';
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
    fireEvent.click(screen.getByText('세부 AI 옵션')); fireEvent.click(screen.getByText('판단력'));
    fireEvent.change(screen.getByLabelText('행동 평가값 노이즈'), { target: { value: '7' } });
    expect(slider).toHaveAttribute('aria-valuenow', '3'); expect(slider).toHaveAttribute('aria-valuetext', '사용자 지정');
    expect(screen.getByText('사용자 지정').closest('[data-difficulty]')).toHaveAttribute('data-difficulty', 'custom');
    fireEvent.click(screen.getByRole('button', { name: '중급' }));
    expect(screen.getByLabelText('행동 평가값 노이즈')).toHaveValue(12);
    expect(screen.getByText('반응 지연 175–225ms · 입력 정밀도 85–95%')).toBeInTheDocument();
  });
  it('keeps manual personality through preset changes without marking custom', () => {
    render(<Harness />); fireEvent.click(screen.getByText('세부 AI 옵션')); fireEvent.click(screen.getByText('성향'));
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
    render(<Harness />); fireEvent.click(screen.getByText('세부 AI 옵션')); fireEvent.click(screen.getByText('판단력'));
    const adaptation = screen.getByLabelText('조작 반전 대응력');
    expect(adaptation).toHaveValue(60);
    fireEvent.change(adaptation, { target: { value: '30' } });
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', '사용자 지정');
    fireEvent.click(screen.getByRole('button', { name: '하급' })); expect(adaptation).toHaveValue(25);
    fireEvent.click(screen.getByRole('button', { name: '상급' })); expect(adaptation).toHaveValue(100);
  });
  it('offers temporary memory and marks it as custom until a preset is selected', () => {
    render(<Harness />); fireEvent.click(screen.getByText('세부 AI 옵션')); fireEvent.click(screen.getByText('관측 정보'));
    const hidden = screen.getByLabelText('보이지 않는 대상 정보');
    fireEvent.change(hidden, { target: { value: 'temporary' } });
    expect(hidden).toHaveValue('temporary');
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', '사용자 지정');
    fireEvent.click(screen.getByRole('button', { name: '상급' })); expect(hidden).toHaveValue('remembered');
  });
});

describe('grouped and shared AI settings', () => {
  it('collapses sections, expands them together and edits all estimation groups once', () => {
    const { container } = render(<Harness />);
    fireEvent.click(screen.getByText('세부 AI 옵션'));
    expect(container.querySelectorAll('details[open]')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '모두 펼치기' }));
    expect(container.querySelectorAll('details[open]')).toHaveLength(8);
    fireEvent.click(screen.getByRole('button', { name: '모두 접기' }));
    fireEvent.click(screen.getByText('내부 수치 추정'));
    const rounding = screen.getByLabelText('모든 내부 수치 반올림 간격');
    expect(rounding).toHaveValue(null); expect(rounding).toHaveAttribute('placeholder', '각각 다름');
    fireEvent.change(screen.getByLabelText('모든 내부 수치 최대 오차율'), { target: { value: '7' } });
    for (const label of Object.values(AI_ESTIMATION_LABELS)) expect(screen.getByLabelText(label + ' 최대 오차율')).toHaveValue(7);
    fireEvent.change(rounding, { target: { value: '10' } });
    for (const label of Object.values(AI_ESTIMATION_LABELS)) expect(screen.getByLabelText(label + ' 반올림 간격')).toHaveValue(10);
    fireEvent.change(screen.getByLabelText('이동 최대 오차율'), { target: { value: '9' } });
    expect(screen.getByLabelText('모든 내부 수치 최대 오차율')).toHaveValue(null);
    fireEvent.change(screen.getByLabelText('모든 내부 수치 정보 모드'), { target: { value: 'exact' } });
    expect(screen.getByLabelText('모든 내부 수치 최대 오차율')).toBeDisabled();
    for (const label of Object.values(AI_ESTIMATION_LABELS)) expect(screen.getByLabelText(label + ' 정보 모드')).toHaveValue('exact');
    fireEvent.click(screen.getByRole('button', { name: '모두 접기' }));
    expect(container.querySelectorAll('details[open]')).toHaveLength(1);
  });
  it('applies forecast and input values together, preserving unrelated settings and personality', () => {
    render(<Harness />); fireEvent.click(screen.getByText('세부 AI 옵션'));
    fireEvent.click(screen.getByText('미래 예측', { selector: 'span' }));
    fireEvent.change(screen.getByLabelText('모든 미래 예측 길이'), { target: { value: '1400' } });
    fireEvent.change(screen.getByLabelText('모든 미래 예측 최대 위치 오차'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('모든 미래 예측 최대 시점 오차'), { target: { value: '30' } });
    for (const label of Object.values(AI_FORECAST_LABELS)) {
      expect(screen.getByLabelText(label + ' 예측 길이')).toHaveValue(1400);
      expect(screen.getByLabelText(label + ' 최대 위치 오차')).toHaveValue(12);
      expect(screen.getByLabelText(label + ' 최대 시점 오차')).toHaveValue(30);
    }
    expect(screen.getByLabelText('미래 예측 반영')).toHaveValue(50);
    fireEvent.click(screen.getByText('미래 예측', { selector: 'span' }));
    fireEvent.click(screen.getByText('입력'));
    fireEvent.change(screen.getByLabelText('최저 입력 정밀도'), { target: { value: '70' } });
    fireEvent.change(screen.getByLabelText('최고 입력 정밀도'), { target: { value: '80' } });
    fireEvent.change(screen.getByLabelText('최대 입력 지연'), { target: { value: '25' } });
    for (const label of Object.values(AI_INPUT_LABELS)) {
      expect(screen.getByLabelText(label + ' 공통 정밀도 사용')).toBeChecked();
      expect(screen.getByLabelText(label + ' 최저 정밀도')).toBeDisabled();
      expect(screen.getByLabelText(label + ' 최고 정밀도')).toBeDisabled();
      fireEvent.click(screen.getByLabelText(label + ' 공통 최대 지연 사용'));
      expect(screen.getByLabelText(label + ' 최대 지연')).toHaveValue(25);
      expect(screen.getByLabelText(label + ' 최대 지연')).toBeDisabled();
    }
    fireEvent.change(screen.getByLabelText('최대 입력 지연'), { target: { value: '30' } });
    expect(screen.getByLabelText('기본 공격 입력 최대 지연')).toHaveValue(30);
    fireEvent.click(screen.getByLabelText('기본 공격 입력 공통 최대 지연 사용'));
    expect(screen.getByLabelText('기본 공격 입력 최대 지연')).toHaveValue(12);
    expect(screen.getByLabelText('기본 공격 입력 최대 지연')).toBeEnabled();
    expect(screen.getByLabelText('최저 입력 정밀도')).toHaveValue(70);
    fireEvent.click(screen.getByText('성향'));
    expect(screen.getByLabelText('공격성')).toBeDisabled();
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', '사용자 지정');
    fireEvent.click(screen.getByRole('button', { name: '완전' }));
    fireEvent.click(screen.getByText('미래 예측', { selector: 'span' }));
    expect(screen.getByLabelText('모든 미래 예측 길이')).toHaveValue(2000);
    expect(screen.getByLabelText('최대 입력 지연')).toHaveValue(0);
    expect(screen.getByLabelText('기본 공격 입력 공통 정밀도 사용')).toBeChecked();
    expect(screen.getByLabelText('기본 공격 입력 공통 최대 지연 사용')).not.toBeChecked();
  });
});
