import * as SliderPrimitive from '@radix-ui/react-slider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  AI_INFO_LABELS, AI_PRESET_COLORS, AI_PRESET_IDS, AI_PRESET_LABELS, AI_TRAIT_LABELS,
  changeAIParameters, selectAIPreset, type AIInfoKey, type AIParameters, type AISettings, type AITrait, type AITraits,
} from '@/types/ai';

interface Props {
  settings: AISettings;
  automaticTraits?: AITraits;
  onChange: (settings: AISettings) => void;
  onBack: () => void;
  onConfirm: () => void;
}
type NumericParameter = { [K in keyof AIParameters]: AIParameters[K] extends number ? K : never }[keyof AIParameters];
const traitDescriptions: Record<AITrait, string> = {
  aggression: '접근과 공격 기회를 더 적극적으로 선택합니다.', skill: '스킬 사용 기회를 더 적극적으로 선택합니다.',
  ultimate: '궁극기를 더 빨리 사용합니다.', defense: '방어와 위험 회피를 더 중시합니다.',
  spacing: '캐릭터의 선호 교전 거리를 늘립니다.', recovery: '회복 장소와 마나 보존을 더 중시합니다.',
};
const presetDescriptions = {
  easy: '느린 반응과 잦은 판단·입력 실수로 상대하기 쉬운 AI입니다.',
  medium: '약간의 실수가 있으며 미래 예측과 패턴 학습이 제한됩니다.',
  hard: '빠른 반응과 정교한 추정을 사용하지만 보이지 않는 정보는 알지 못합니다.',
  perfect: '반응 지연과 입력 오차 없이 현재 AI의 모든 정보를 사용합니다.',
  custom: '세부 옵션을 직접 조절한 AI입니다.',
};

const AIDifficultySelect = ({ settings, automaticTraits, onChange, onBack, onConfirm }: Props) => {
  const parameters = settings.parameters;
  const color = AI_PRESET_COLORS[settings.difficulty];
  const change = (values: Partial<AIParameters>) => onChange(changeAIParameters(settings, values));
  const numeric = (name: NumericParameter, label: string, max: number, unit: string) => (
    <div className="flex items-center justify-between gap-3" key={name}>
      <Label htmlFor={`ai-${name}`} className="min-w-0">{label}</Label>
      <div className="flex shrink-0 items-center gap-2">
        <Input id={`ai-${name}`} type="number" min={0} max={max} step={1} value={parameters[name]}
          onChange={e => { const value = e.target.valueAsNumber; if (Number.isFinite(value)) change({ [name]: value }); }} className="w-24" />
        <span className="w-7 text-xs text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-muted p-4 md:p-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 text-center">
          <h1 className="mb-2 text-4xl font-bold">AI 난이도 선택</h1>
          <p className="text-muted-foreground">상대 AI의 실력과 성향을 선택하세요</p>
        </header>
        <div className="space-y-6">
          <div className="space-y-5 rounded-xl border bg-card p-4 shadow-lg sm:p-6" data-difficulty={settings.difficulty}>
            <div className="flex items-center justify-between gap-3">
              <Label id="ai-difficulty-label" className="text-base">난이도</Label>
              <span className="rounded-md px-3 py-1 font-bold text-white" style={{ background: color, color: settings.difficulty === 'medium' ? '#1c1917' : undefined }}>
                {AI_PRESET_LABELS[settings.difficulty]}
              </span>
            </div>
            <SliderPrimitive.Root aria-labelledby="ai-difficulty-label" min={0} max={3} step={1}
              value={[AI_PRESET_IDS.indexOf(settings.lastPreset)]}
              onValueChange={([value]) => onChange(selectAIPreset(settings, AI_PRESET_IDS[value]))}
              className="relative flex h-6 w-full touch-none select-none items-center">
              <SliderPrimitive.Track className="relative h-3 w-full grow rounded-full" style={{ background: color }} />
              <SliderPrimitive.Thumb aria-labelledby="ai-difficulty-label" aria-valuetext={AI_PRESET_LABELS[settings.difficulty]} className="block h-6 w-6 rounded-full border-2 border-foreground bg-background shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </SliderPrimitive.Root>
            {/* The 24px thumb travels between 12px-inset endpoints. Match its center positions. */}
            <div className="relative mx-3 h-9">
              {AI_PRESET_IDS.map((preset, index) => (
                <Button key={preset} variant="ghost" size="sm" aria-pressed={settings.difficulty === preset}
                  onClick={() => onChange(selectAIPreset(settings, preset))}
                  style={{ left: `${index / 3 * 100}%` }} className="absolute min-w-0 -translate-x-1/2 px-1">{AI_PRESET_LABELS[preset]}</Button>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">{presetDescriptions[settings.difficulty]}</p>
            <p className="text-sm">반응 지연 {parameters.reactionMin}–{parameters.reactionMax}ms · 입력 정밀도 {parameters.precisionMin}–{parameters.precisionMax}%</p>
          </div>
          <details className="group rounded-xl border bg-card p-4 shadow-lg sm:p-6">
            <summary className="cursor-pointer font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">세부 AI 옵션</summary>
            <div className="mt-5 grid gap-6 md:grid-cols-2">
              <fieldset className="space-y-3">
                <legend className="mb-3 font-semibold">피지컬</legend>
                {numeric('reactionMin', '최소 반응 지연', 1000, 'ms')}
                {numeric('reactionMax', '최대 반응 지연', 1000, 'ms')}
                {numeric('precisionMin', '최저 입력 정밀도', 100, '%')}
                {numeric('precisionMax', '최고 입력 정밀도', 100, '%')}
                <p className="text-xs text-muted-foreground">정밀도가 낮으면 이동·공격·점프 시점에 오차가 생기거나 입력을 놓칩니다.</p>
              </fieldset>
              <fieldset className="space-y-3">
                <legend className="mb-3 font-semibold">판단력</legend>
                {numeric('noise', '행동 평가값 노이즈', 100, '')}
                {numeric('character', '캐릭터 특성 반영', 100, '%')}
                {numeric('prediction', '미래 예측 반영', 100, '%')}
                {numeric('learning', '상대 패턴 학습 반영', 100, '%')}
                {numeric('controlAdaptation', '조작 반전 대응력', 100, '%')}
                <p className="text-xs text-muted-foreground">반전 상태를 인지한 뒤 매 판단에서 올바르게 대응할 확률입니다. 100%는 반응 지연 후 즉시 대응하며, 낮을수록 방향·점프 조작을 잘못합니다.</p>
              </fieldset>
              <fieldset className="space-y-3">
                <legend className="mb-3 font-semibold">정보량</legend>
                {numeric('observationInterval', '외부 정보 갱신 간격', 1000, 'ms')}
                <p className="text-xs text-muted-foreground">0ms는 매 게임 틱입니다. 관찰한 상황에 반응하기까지 별도의 반응 지연이 적용됩니다.</p>
                <div className="space-y-2">
                  <Label htmlFor="ai-internal">추정 가능한 내부 수치</Label>
                  <select id="ai-internal" value={parameters.internal} onChange={e => {
                    const value = e.target.value;
                    if (value === 'none' || value === 'estimated' || value === 'exact') change({ internal: value });
                  }} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                    <option value="none">미사용</option><option value="estimated">관측으로 추정</option><option value="exact">정확한 내부 정보</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ai-hidden">보이지 않는 대상 정보</Label>
                  <select id="ai-hidden" value={parameters.hidden} onChange={e => {
                    const value = e.target.value;
                    if (value === 'temporary' || value === 'remembered' || value === 'all') change({ hidden: value });
                  }} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                    <option value="temporary">관찰 기억·3초 후 잊음</option><option value="remembered">관찰한 위치만 기억</option><option value="all">전체 정보</option>
                  </select>
                  <p className="text-xs text-muted-foreground">3초 기억은 마지막으로 관찰한 시점부터 계산합니다. 다시 보이면 갱신되며 일시정지 중에는 시간이 흐르지 않습니다.</p>
                </div>
                {(Object.keys(AI_INFO_LABELS) as AIInfoKey[]).map(name => (
                  <div key={name} className="flex items-center justify-between gap-3">
                    <Label htmlFor={`ai-info-${name}`}>{AI_INFO_LABELS[name]}</Label>
                    <Switch id={`ai-info-${name}`} checked={parameters.information[name]} onCheckedChange={checked => change({ information: { ...parameters.information, [name]: checked } })} />
                  </div>
                ))}
              </fieldset>
              <fieldset className="space-y-4">
                <legend className="mb-3 font-semibold">성향</legend>
                <p className="text-xs text-muted-foreground">자동 성향은 1배 주변에서 새 게임마다 추첨되며 재대결까지 유지됩니다. 수동값과 성향 변경은 난이도에 영향을 주지 않습니다.</p>
                {(Object.keys(AI_TRAIT_LABELS) as AITrait[]).map(name => {
                  const trait = settings.traits[name];
                  const value = trait.automatic ? automaticTraits?.[name] ?? 1 : trait.value;
                  const setTrait = (automatic: boolean, nextValue: number) => onChange({ ...settings, traits: { ...settings.traits, [name]: { automatic, value: nextValue } } });
                  return (
                    <div key={name} className="space-y-2 rounded-lg bg-muted/40 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Label htmlFor={`ai-trait-${name}`}>{AI_TRAIT_LABELS[name]}</Label>
                        <div className="flex items-center gap-2">
                          <Label htmlFor={`ai-auto-${name}`} className="text-xs">자동 추첨</Label>
                          <Switch id={`ai-auto-${name}`} checked={trait.automatic} onCheckedChange={checked => setTrait(checked, Math.round(value * 100) / 100)} />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input id={`ai-trait-${name}`} type="number" min={0} max={2} step={0.05} disabled={trait.automatic} value={Math.round(value * 100) / 100}
                          onChange={e => { const n = e.target.valueAsNumber; if (Number.isFinite(n)) setTrait(false, Math.max(0, Math.min(2, n))); }} className="w-24" />
                        <span className="text-sm">배</span>
                        <Button variant="ghost" size="sm" onClick={() => setTrait(false, 1)}>1배 고정</Button>
                      </div>
                      <p className="text-xs text-muted-foreground">{traitDescriptions[name]}</p>
                    </div>
                  );
                })}
              </fieldset>
            </div>
          </details>
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Button variant="outline" size="lg" onClick={onBack}>캐릭터 다시 선택</Button>
          <Button size="lg" onClick={onConfirm}>맵 선택</Button>
        </div>
      </div>
    </main>
  );
};
export default AIDifficultySelect;
