import { Character } from '@/types/game';
import { Button } from '@/components/ui/button';
import { Trophy, RotateCcw, Home } from 'lucide-react';

interface ResultScreenProps {
  winner: 1 | 2;
  player1Character: Character;
  player2Character: Character;
  scores: [number, number];
  onRematch: () => void;
  onReturnToMenu: () => void;
}

const ResultScreen = ({
  winner,
  player1Character,
  player2Character,
  scores,
  onRematch,
  onReturnToMenu,
}: ResultScreenProps) => {
  const winnerCharacter = winner === 1 ? player1Character : player2Character;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted p-4">
      <div className="text-center space-y-8 animate-fade-in">
        {/* Trophy icon */}
        <div className="flex justify-center">
          <div 
            className="w-24 h-24 rounded-full flex items-center justify-center"
            style={{ 
              backgroundColor: winnerCharacter.color,
              boxShadow: `0 0 40px ${winnerCharacter.color}`,
            }}
          >
            <Trophy className="w-12 h-12 text-background" />
          </div>
        </div>

        {/* Winner announcement */}
        <div>
          <h1 className="text-5xl font-bold mb-2">
            플레이어 {winner} 승리!
          </h1>
          <p className="text-2xl text-muted-foreground">
            {winnerCharacter.nameKo}
          </p>
        </div>

        {/* Final score */}
        <div className="flex justify-center gap-8">
          <div className={`text-center ${winner === 1 ? 'scale-110' : 'opacity-70'}`}>
            <div 
              className="w-16 h-16 rounded-lg mx-auto mb-2 flex items-center justify-center text-2xl font-bold"
              style={{ backgroundColor: player1Character.color }}
            >
              P1
            </div>
            <div className="text-3xl font-bold text-primary">{scores[0]}</div>
            <div className="text-sm text-muted-foreground">{player1Character.nameKo}</div>
          </div>

          <div className="text-4xl font-bold text-muted-foreground self-center">
            -
          </div>

          <div className={`text-center ${winner === 2 ? 'scale-110' : 'opacity-70'}`}>
            <div 
              className="w-16 h-16 rounded-lg mx-auto mb-2 flex items-center justify-center text-2xl font-bold"
              style={{ backgroundColor: player2Character.color }}
            >
              P2
            </div>
            <div className="text-3xl font-bold text-destructive">{scores[1]}</div>
            <div className="text-sm text-muted-foreground">{player2Character.nameKo}</div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex justify-center gap-4">
          <Button 
            size="lg" 
            onClick={onRematch}
            className="gap-2"
          >
            <RotateCcw className="w-5 h-5" />
            재대결
          </Button>
          <Button 
            size="lg" 
            variant="outline" 
            onClick={onReturnToMenu}
            className="gap-2"
          >
            <Home className="w-5 h-5" />
            메뉴로
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ResultScreen;
