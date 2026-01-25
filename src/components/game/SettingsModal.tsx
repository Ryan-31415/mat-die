import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { GameSettings } from '@/types/game';
import { Volume2, VolumeX, Clock, Trophy } from 'lucide-react';

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: GameSettings;
  onSettingsChange: (settings: GameSettings) => void;
}

const SettingsModal = ({
  open,
  onOpenChange,
  settings,
  onSettingsChange,
}: SettingsModalProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl">게임 설정</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Round Count */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-primary" />
              <Label className="text-base">라운드 수</Label>
            </div>
            <ToggleGroup
              type="single"
              value={String(settings.maxRounds)}
              onValueChange={(value) => {
                if (value) {
                  onSettingsChange({
                    ...settings,
                    maxRounds: Number(value) as 1 | 3 | 5,
                  });
                }
              }}
              className="justify-start"
            >
              <ToggleGroupItem value="1" className="px-6">
                1 라운드
              </ToggleGroupItem>
              <ToggleGroupItem value="3" className="px-6">
                3 라운드
              </ToggleGroupItem>
              <ToggleGroupItem value="5" className="px-6">
                5 라운드
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {/* Time Limit */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              <Label className="text-base">라운드 제한 시간</Label>
            </div>
            <ToggleGroup
              type="single"
              value={String(settings.roundTimeLimit)}
              onValueChange={(value) => {
                if (value) {
                  onSettingsChange({
                    ...settings,
                    roundTimeLimit: Number(value),
                  });
                }
              }}
              className="justify-start"
            >
              <ToggleGroupItem value="30" className="px-6">
                30초
              </ToggleGroupItem>
              <ToggleGroupItem value="60" className="px-6">
                60초
              </ToggleGroupItem>
              <ToggleGroupItem value="90" className="px-6">
                90초
              </ToggleGroupItem>
              <ToggleGroupItem value="0" className="px-6">
                무제한
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {/* Sound */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {settings.soundEnabled ? (
                <Volume2 className="h-5 w-5 text-primary" />
              ) : (
                <VolumeX className="h-5 w-5 text-muted-foreground" />
              )}
              <Label className="text-base">사운드 효과</Label>
            </div>
            <Switch
              checked={settings.soundEnabled}
              onCheckedChange={(checked) =>
                onSettingsChange({ ...settings, soundEnabled: checked })
              }
            />
          </div>
        </div>

        <Button onClick={() => onOpenChange(false)} className="w-full">
          확인
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsModal;
