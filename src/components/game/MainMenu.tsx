import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Gamepad2, Settings, HelpCircle, Bot, Users } from 'lucide-react';

interface MainMenuProps {
  onStartGame: (mode: 'single' | 'multi') => void;
  onOpenSettings: () => void;
  onOpenControls: () => void;
}

const MainMenu = ({ onStartGame, onOpenSettings, onOpenControls }: MainMenuProps) => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-background to-muted p-4">
      <div className="text-center mb-12">
        <h1 className="text-6xl font-bold mb-4 bg-gradient-to-r from-red-500 via-purple-500 to-blue-500 bg-clip-text text-transparent">
          MAT-DIE
        </h1>
        <p className="text-xl text-muted-foreground">맞다이: 2인용 대전 게임</p>
      </div>

      <Card className="w-full max-w-md bg-card/80 backdrop-blur-sm border-2">
        <CardContent className="p-8 space-y-4">
          <Button
            onClick={() => onStartGame('single')}
            size="lg"
            className="w-full h-16 text-xl gap-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600"
          >
            <Bot className="h-6 w-6" />
            1인 전투 (vs AI)
          </Button>

          <Button
            onClick={() => onStartGame('multi')}
            size="lg"
            className="w-full h-16 text-xl gap-3 bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600"
          >
            <Users className="h-6 w-6" />
            2인 대전
          </Button>

          <Button
            onClick={onOpenSettings}
            variant="outline"
            size="lg"
            className="w-full h-14 text-lg gap-3"
          >
            <Settings className="h-5 w-5" />
            게임 설정
          </Button>

          <Button
            onClick={onOpenControls}
            variant="ghost"
            size="lg"
            className="w-full h-14 text-lg gap-3"
          >
            <HelpCircle className="h-5 w-5" />
            조작법 안내
          </Button>
        </CardContent>
      </Card>

      <div className="mt-8 flex gap-8 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-blue-500 rounded-sm" />
          <span>Player 1</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-red-500 rounded-sm" />
          <span>Player 2</span>
        </div>
      </div>
    </div>
  );
};

export default MainMenu;
