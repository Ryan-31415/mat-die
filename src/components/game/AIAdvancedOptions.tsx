import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  AI_INFO_LABELS, AI_INPUT_LABELS, AI_ESTIMATION_LABELS, AI_FORECAST_LABELS, AI_INTERNAL_MODES, AI_HIDDEN_MODES, AI_ATTACK_MODES,
  type AIParameters, type AIInfoKey, type AIInputKey, type AIEstimationKey, type AIForecastKey, type AIEstimation, type AIForecast,
} from '@/types/ai';

interface Props { parameters: AIParameters; change: (changes: Partial<AIParameters>) => void; children?: ReactNode }
type NumericParameter = { [K in keyof AIParameters]: AIParameters[K] extends number ? K : never }[keyof AIParameters];

function NumberOption({ id, label, value, max, unit, update, disabled = false, step = 1, min = 0 }: {
  id: string; label: string; value: number | ''; max: number; unit: string; update: (value: number) => void;
  disabled?: boolean; step?: number; min?: number;
}) {
  return <div className="flex flex-col justify-between gap-2 rounded-md border bg-background/60 p-3 sm:flex-row sm:items-center">
    <Label htmlFor={id} className="min-w-0">{label}</Label>
    <div className="flex shrink-0 items-center gap-2">
      <Input id={id} type="number" min={min} max={max} step={step} value={value} disabled={disabled} placeholder="각각 다름"
        onChange={e => { const n = e.target.valueAsNumber; if (Number.isFinite(n)) update(n); }} className="w-24" />
      <span className="min-w-7 text-xs text-muted-foreground">{unit}</span>
    </div>
  </div>;
}
function ModeOption<T extends string>({ id, label, value, choices, labels, update }: {
  id: string; label: string; value: T | ''; choices: readonly T[]; labels: Record<T, string>; update: (value: T) => void;
}) {
  return <div className="space-y-2">
    <Label htmlFor={id}>{label}</Label>
    <select id={id} value={value} onChange={e => { const next = choices.find(v => v === e.target.value); if (next !== undefined) update(next); }}
      className="h-10 w-full rounded-md border bg-background px-3 text-sm">
      {value === '' && <option value="" disabled>항목마다 다름</option>}
      {choices.map(choice => <option key={choice} value={choice}>{labels[choice]}</option>)}
    </select>
  </div>;
}
const estimationNames = Object.keys(AI_ESTIMATION_LABELS) as AIEstimationKey[];
const forecastNames = Object.keys(AI_FORECAST_LABELS) as AIForecastKey[];
const sectionNames = ['input', 'judgment', 'observation', 'estimation', 'forecast', 'learning', 'traits'];
function commonValue<T extends string | number>(values: readonly T[]): T | '' {
  return values.every(value => value === values[0]) ? values[0] : '';
}
function BulkCard({ children, description = '값을 바꾸면 아래 모든 항목에 적용됩니다. 서로 다른 값은 ‘각각 다름’으로 표시합니다.' }: { children: ReactNode; description?: string }) {
  return <div className="mb-4 space-y-3 rounded-lg border border-primary/25 bg-primary/5 p-4">
    <p className="font-semibold">공통 설정</p>
    <p className="text-xs text-muted-foreground">{description}</p>
    {children}
  </div>;
}
export default function AIAdvancedOptions({ parameters: p, change, children }: Props) {
  const [expanded, setExpanded] = useState<string[]>([]);
  const section = (id: string, title: string, summary: string, content: ReactNode) => (
    <details className="group rounded-xl border bg-background/50" open={expanded.includes(id)}>
      <summary onClick={event => { event.preventDefault(); setExpanded(previous => previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]); }} className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <span className="min-w-0"><span className="block font-semibold">{title}</span><span className="mt-1 block text-xs text-muted-foreground">{summary}</span></span>
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      {expanded.includes(id) && <div className="border-t p-4 sm:p-5">{content}</div>}
    </details>
  );
  const bulkEstimation = (values: Partial<AIEstimation>) => {
    const estimation = { ...p.estimation };
    for (const key of estimationNames) estimation[key] = { ...estimation[key], ...values };
    change({ estimation });
  };
  const bulkForecasts = (values: Partial<AIForecast>) => {
    const forecasts = { ...p.forecasts };
    for (const key of forecastNames) forecasts[key] = { ...forecasts[key], ...values };
    change({ forecasts });
  };
  const numeric = (name: NumericParameter, label: string, max: number, unit: string) =>
    <NumberOption id={'ai-' + name} label={label} value={p[name]} max={max} unit={unit} update={value => change({ [name]: value })} />;
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground">항목을 펼쳐 공통 설정과 개별 설정을 조절하세요.</p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setExpanded(sectionNames)}>모두 펼치기</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setExpanded([])}>모두 접기</Button>
      </div>
    </div>
    {section('input', '입력', `반응 ${p.reactionMin}–${p.reactionMax}ms · 공통 정밀도 ${p.precisionMin}–${p.precisionMax}%`, <>
    <fieldset className="min-w-0 space-y-3">
      <legend className="sr-only">입력</legend>
      {numeric('reactionMin', '최소 반응 지연', 1000, 'ms')}
      {numeric('reactionMax', '최대 반응 지연', 1000, 'ms')}
      <BulkCard description="공통 정밀도 또는 공통 최대 지연 사용을 켠 입력 종류에 적용됩니다.">
      {numeric('precisionMin', '최저 입력 정밀도', 100, '%')}
      {numeric('precisionMax', '최고 입력 정밀도', 100, '%')}
      {numeric('inputDelayMaxMs', '최대 입력 지연', 1000, 'ms')}
      <p className="text-xs text-muted-foreground">정밀도는 입력 성공 확률입니다. 입력 지연은 정밀도와 별도로 적용됩니다.</p>
      </BulkCard>
      <div className="grid gap-4 lg:grid-cols-2">
      {(Object.keys(AI_INPUT_LABELS) as AIInputKey[]).map(name => {
        const input = p.inputs[name], label = AI_INPUT_LABELS[name];
        const update = (values: Partial<typeof input>) => change({ inputs: { ...p.inputs, [name]: { ...input, ...values } } });
        return <div key={name} className="space-y-3 rounded-lg bg-muted/40 p-3">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={'ai-input-common-' + name}>{label} 공통 정밀도 사용</Label>
            <Switch id={'ai-input-common-' + name} checked={input.useCommonPrecision} onCheckedChange={useCommonPrecision => update({ useCommonPrecision })} />
          </div>
          <NumberOption id={'ai-input-min-' + name} label={label + ' 최저 정밀도'} value={input.precisionMin} max={100} unit="%" update={precisionMin => update({ precisionMin })} disabled={input.useCommonPrecision} />
          <NumberOption id={'ai-input-max-' + name} label={label + ' 최고 정밀도'} value={input.precisionMax} max={100} unit="%" update={precisionMax => update({ precisionMax })} disabled={input.useCommonPrecision} />
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={'ai-input-common-delay-' + name}>{label} 공통 최대 지연 사용</Label>
            <Switch id={'ai-input-common-delay-' + name} checked={input.useCommonDelay} onCheckedChange={useCommonDelay => update({ useCommonDelay })} />
          </div>
          <NumberOption id={'ai-input-delay-' + name} label={label + ' 최대 지연'} value={input.useCommonDelay ? p.inputDelayMaxMs : input.delayMaxMs} max={1000} unit="ms" update={delayMaxMs => update({ delayMaxMs })} disabled={input.useCommonDelay} />
        </div>;
      })}
      </div>
    </fieldset>
    </>)}
    {section('judgment', '판단력', `캐릭터 특성 ${p.character}% · 판단 노이즈 ${p.noise}`, <>
    <fieldset className="min-w-0 space-y-3">
      <legend className="sr-only">판단력</legend>
      {numeric('noise', '행동 평가값 노이즈', 100, '')}
      {numeric('character', '캐릭터 특성 반영', 100, '%')}
      {numeric('controlAdaptation', '조작 반전 대응력', 100, '%')}
      <p className="text-xs text-muted-foreground">반전 상태를 인지한 뒤 올바르게 대응할 확률입니다. 100%는 반응 지연 후 즉시 대응합니다.</p>
    </fieldset>
    </>)}
    {section('observation', '관측 정보', `정보 갱신 ${p.observationInterval}ms · 허용 정보 ${Object.values(p.information).filter(Boolean).length}/13`, <>
    <fieldset className="min-w-0 space-y-3">
      <legend className="sr-only">관측 정보</legend>
      {numeric('observationInterval', '외부 정보 갱신 간격', 1000, 'ms')}
      <p className="text-xs text-muted-foreground">0ms는 매 게임 틱입니다. 관찰 후 별도의 반응 지연이 적용됩니다.</p>
      <ModeOption id="ai-hidden" label="보이지 않는 대상 정보" value={p.hidden} choices={AI_HIDDEN_MODES} labels={{ none: '대상 정보 미사용', visible: '현재 보이는 것만', temporary: '시간제 기억', remembered: '계속 기억', all: '전체 현재 정보' }} update={hidden => change({ hidden })} />
      <NumberOption id="ai-hiddenMemoryMs" label="덫 기억 유지시간" value={p.hiddenMemoryMs} max={30000} unit="ms" update={hiddenMemoryMs => change({ hiddenMemoryMs })} disabled={p.hidden !== 'temporary'} />
      <p className="text-xs text-muted-foreground">미사용은 보이는 덫도 제외합니다. 기억시간은 마지막 관찰부터 계산하며 일시정지 중에는 흐르지 않습니다. 계속 기억도 추정한 수명이 끝나면 잊습니다. 은신 캐릭터는 화면처럼 반투명으로 보입니다.</p>
      <ModeOption id="ai-hiddenAttacks" label="보이지 않는 공격 판정" value={p.hiddenAttacks} choices={AI_ATTACK_MODES} labels={{ none: '미사용', inferred: '공격 애니메이션으로 재구성', exact: '실제 현재 판정 사용' }} update={hiddenAttacks => change({ hiddenAttacks })} />
      {(Object.keys(AI_INFO_LABELS) as AIInfoKey[]).map(name => <div key={name} className="flex items-center justify-between gap-3">
        <Label htmlFor={'ai-info-' + name}>{AI_INFO_LABELS[name]}</Label>
        <Switch id={'ai-info-' + name} checked={p.information[name]} onCheckedChange={checked => change({ information: { ...p.information, [name]: checked } })} />
      </div>)}
    </fieldset>
    </>)}
    {section('estimation', '내부 수치 추정', `5개 수치 그룹 · 추정 오차와 반올림 간격`, <>
    <fieldset className="min-w-0 space-y-3">
      <legend className="sr-only">내부 수치 추정</legend>
      <p className="text-xs text-muted-foreground">추정값에 ±최대 오차율을 적용한 뒤 반올림합니다. 간격 0은 반올림하지 않습니다. 정확 모드에서도 정보 접근 제한을 지킵니다.</p>
      <BulkCard>
        <ModeOption id="ai-bulk-estimation-mode" label="모든 내부 수치 정보 모드" value={commonValue(estimationNames.map(key => p.estimation[key].mode))} choices={AI_INTERNAL_MODES} labels={{ none: '미사용', estimated: '관측으로 추정', exact: '정확한 현재 정보' }} update={mode => bulkEstimation({ mode })} />
        <NumberOption id="ai-bulk-estimation-error" label="모든 내부 수치 최대 오차율" value={commonValue(estimationNames.map(key => p.estimation[key].errorPercent))} max={100} unit="%" update={errorPercent => bulkEstimation({ errorPercent })} disabled={estimationNames.every(key => p.estimation[key].mode !== 'estimated')} />
        <NumberOption id="ai-bulk-estimation-rounding" label="모든 내부 수치 반올림 간격" value={commonValue(estimationNames.map(key => p.estimation[key].rounding))} max={30000} unit="각 단위" step={0.5} update={rounding => bulkEstimation({ rounding })} disabled={estimationNames.every(key => p.estimation[key].mode !== 'estimated')} />
        <p className="text-xs text-muted-foreground">반올림 간격은 각 항목의 단위와 상한을 따릅니다. 예: 10은 이동 10px/s, 쿨다운·시간 10ms, 효과 강도 10%p, 투사체 특성 10%입니다.</p>
      </BulkCard>
      <div className="grid gap-4 lg:grid-cols-2">
      {(Object.keys(AI_ESTIMATION_LABELS) as AIEstimationKey[]).map(name => {
        const estimate = p.estimation[name], label = AI_ESTIMATION_LABELS[name];
        const update = (values: Partial<typeof estimate>) => change({ estimation: { ...p.estimation, [name]: { ...estimate, ...values } } });
        const disabled = estimate.mode !== 'estimated';
        const unit = name === 'movement' ? 'px/s' : name === 'cooldowns' || name === 'durations' ? 'ms' : name === 'effects' ? '%p' : '%';
        const max = name === 'movement' ? 2000 : name === 'cooldowns' || name === 'durations' ? 30000 : 100;
        return <div key={name} className="space-y-3 rounded-lg bg-muted/40 p-3">
          <ModeOption id={'ai-estimation-' + name} label={label + ' 정보 모드'} value={estimate.mode} choices={AI_INTERNAL_MODES} labels={{ none: '미사용', estimated: '관측으로 추정', exact: '정확한 현재 정보' }} update={mode => update({ mode })} />
          <NumberOption id={'ai-estimation-error-' + name} label={label + ' 최대 오차율'} value={estimate.errorPercent} max={100} unit="%" update={errorPercent => update({ errorPercent })} disabled={disabled} />
          <NumberOption id={'ai-estimation-rounding-' + name} label={label + ' 반올림 간격'} value={estimate.rounding} max={max} unit={unit} update={rounding => update({ rounding })} disabled={disabled} step={name === 'effects' || name === 'properties' ? 0.5 : 1} />
        </div>;
      })}
      </div>
      <p className="text-xs text-muted-foreground">효과 강도는 퍼센트포인트, 투사체·위험 지대 특성은 공개 기본 수치 대비 비율로 반올림합니다.</p>
    </fieldset>
    </>)}
    {section('forecast', '미래 예측', `반영 ${p.prediction}% · 상대 ${p.forecasts.opponent.horizonMs}ms · 투사체 ${p.forecasts.projectiles.horizonMs}ms · 환경 ${p.forecasts.environment.horizonMs}ms`, <>
    <fieldset className="min-w-0 space-y-3">
      <legend className="sr-only">미래 예측</legend>
      {numeric('prediction', '미래 예측 반영', 100, '%')}
      <p className="text-xs text-muted-foreground">오차는 현재 시점에서 0이며 예측 끝으로 갈수록 증가합니다. 위치 오차는 각 좌표축의 최대 편차입니다. 길이나 반영도가 0이어도 현재 위험과 즉시 충돌을 판단합니다.</p>
      <BulkCard>
        <NumberOption id="ai-bulk-forecast-horizon" label="모든 미래 예측 길이" value={commonValue(forecastNames.map(key => p.forecasts[key].horizonMs))} max={2000} unit="ms" update={horizonMs => bulkForecasts({ horizonMs })} disabled={p.prediction === 0} />
        <NumberOption id="ai-bulk-forecast-position" label="모든 미래 예측 최대 위치 오차" value={commonValue(forecastNames.map(key => p.forecasts[key].positionError))} max={500} unit="px" update={positionError => bulkForecasts({ positionError })} disabled={p.prediction === 0 || forecastNames.every(key => p.forecasts[key].horizonMs === 0)} />
        <NumberOption id="ai-bulk-forecast-timing" label="모든 미래 예측 최대 시점 오차" value={commonValue(forecastNames.map(key => p.forecasts[key].timingErrorMs))} max={1000} unit="ms" update={timingErrorMs => bulkForecasts({ timingErrorMs })} disabled={p.prediction === 0 || forecastNames.every(key => p.forecasts[key].horizonMs === 0)} />
      </BulkCard>
      <div className="grid gap-4 lg:grid-cols-3">
      {(Object.keys(AI_FORECAST_LABELS) as AIForecastKey[]).map(name => {
        const forecast = p.forecasts[name], label = AI_FORECAST_LABELS[name];
        const update = (values: Partial<typeof forecast>) => change({ forecasts: { ...p.forecasts, [name]: { ...forecast, ...values } } });
        const disabled = p.prediction === 0 || forecast.horizonMs === 0;
        return <div key={name} className="space-y-3 rounded-lg bg-muted/40 p-3">
          <p className="font-medium">{label}</p>
          <NumberOption id={'ai-forecast-horizon-' + name} label={label + ' 예측 길이'} value={forecast.horizonMs} max={2000} unit="ms" update={horizonMs => update({ horizonMs })} disabled={p.prediction === 0} />
          <NumberOption id={'ai-forecast-position-' + name} label={label + ' 최대 위치 오차'} value={forecast.positionError} max={500} unit="px" update={positionError => update({ positionError })} disabled={disabled} />
          <NumberOption id={'ai-forecast-timing-' + name} label={label + ' 최대 시점 오차'} value={forecast.timingErrorMs} max={1000} unit="ms" update={timingErrorMs => update({ timingErrorMs })} disabled={disabled} />
        </div>;
      })}
      </div>
    </fieldset>
    </>)}
    {section('learning', '상대 패턴 학습', `반영 ${p.learning}% · 기억 ${p.learningOptions.memoryMs / 1000}초 · 수집 ${p.learningOptions.sampleIntervalMs}ms`, <>
    <fieldset className="min-w-0 space-y-3">
      <legend className="sr-only">상대 패턴 학습</legend>
      {numeric('learning', '상대 패턴 학습 반영', 100, '%')}
      <NumberOption id="ai-learning-memory" label="학습 기억시간" value={p.learningOptions.memoryMs} min={1000} max={30000} unit="ms" update={memoryMs => change({ learningOptions: { ...p.learningOptions, memoryMs } })} disabled={p.learning === 0} />
      <NumberOption id="ai-learning-interval" label="학습 표본 수집 간격" value={p.learningOptions.sampleIntervalMs} min={50} max={1000} unit="ms" update={sampleIntervalMs => change({ learningOptions: { ...p.learningOptions, sampleIntervalMs } })} disabled={p.learning === 0} />
      <NumberOption id="ai-learning-halfLife" label="학습 가중치 반감기" value={p.learningOptions.halfLifeMs} min={1000} max={30000} unit="ms" update={halfLifeMs => change({ learningOptions: { ...p.learningOptions, halfLifeMs } })} disabled={p.learning === 0} />
      <p className="text-xs text-muted-foreground">최대 600개 표본을 기억합니다. 성향과 학습 경향은 라운드·재대결까지 유지하며 새 게임에서는 초기화합니다.</p>
    </fieldset>
    </>)}
    {children && section('traits', '성향', '자동 추첨 또는 캐릭터별 수동 성향', children)}
  </div>;
}
