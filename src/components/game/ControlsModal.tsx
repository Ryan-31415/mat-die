import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ControlsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ControlsModal = ({ open, onOpenChange }: ControlsModalProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl">조작법 안내</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
          {/* Player 1 */}
          <Card className="border-blue-500/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-500 rounded-sm" />
                플레이어 1
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">이동</span>
                <div className="flex gap-1">
                  <kbd className="px-2 py-1 bg-muted rounded text-sm font-mono">W</kbd>
                  <kbd className="px-2 py-1 bg-muted rounded text-sm font-mono">A</kbd>
                  <kbd className="px-2 py-1 bg-muted rounded text-sm font-mono">S</kbd>
                  <kbd className="px-2 py-1 bg-muted rounded text-sm font-mono">D</kbd>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">일반 공격</span>
                <kbd className="px-3 py-1 bg-muted rounded text-sm font-mono">Space</kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">스킬</span>
                <kbd className="px-3 py-1 bg-muted rounded text-sm font-mono">Q</kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">궁극기</span>
                <kbd className="px-3 py-1 bg-muted rounded text-sm font-mono">E</kbd>
              </div>
            </CardContent>
          </Card>

          {/* Player 2 */}
          <Card className="border-red-500/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <div className="w-4 h-4 bg-red-500 rounded-sm" />
                플레이어 2
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">이동</span>
                <div className="flex gap-1">
                  <kbd className="px-2 py-1 bg-muted rounded text-sm font-mono">↑</kbd>
                  <kbd className="px-2 py-1 bg-muted rounded text-sm font-mono">←</kbd>
                  <kbd className="px-2 py-1 bg-muted rounded text-sm font-mono">↓</kbd>
                  <kbd className="px-2 py-1 bg-muted rounded text-sm font-mono">→</kbd>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">일반 공격</span>
                <kbd className="px-3 py-1 bg-muted rounded text-sm font-mono">Enter</kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">스킬</span>
                <kbd className="px-3 py-1 bg-muted rounded text-sm font-mono">Shift</kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">궁극기</span>
                <kbd className="px-3 py-1 bg-muted rounded text-sm font-mono">/</kbd>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="text-center text-sm text-muted-foreground mb-4">
          <p>상대방에게 접근하여 공격하면 데미지를 입힙니다.</p>
          <p>체력이 0이 되면 라운드 패배!</p>
        </div>

        <Button onClick={() => onOpenChange(false)} className="w-full">
          확인
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default ControlsModal;
