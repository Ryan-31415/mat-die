import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Character, CHARACTERS, CharacterType } from '@/types/game';
import { Sword, Target, Flame, Wind, Zap, Shield, Heart, Droplet } from 'lucide-react';

interface CharacterSelectProps {
  onConfirm: (player1: Character, player2: Character) => void;
  onBack: () => void;
}

const characterIcons: Record<CharacterType, React.ReactNode> = {
  gladiator: <Sword className="w-8 h-8" />,
  archer: <Target className="w-8 h-8" />,
  mage: <Flame className="w-8 h-8" />,
  ninja: <Wind className="w-8 h-8" />,
  scientist: <Zap className="w-8 h-8" />,
};

const CharacterCard = ({
  character,
  isSelected,
  onClick,
  playerLabel,
}: {
  character: Character;
  isSelected: boolean;
  onClick: () => void;
  playerLabel?: string;
}) => {
  return (
    <Card
      className={`cursor-pointer transition-all duration-200 hover:scale-105 ${
        isSelected
          ? 'ring-2 ring-primary shadow-lg scale-105'
          : 'hover:shadow-md'
      }`}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div
            className="w-12 h-12 rounded-lg flex items-center justify-center text-primary-foreground"
            style={{ backgroundColor: character.color }}
          >
            {characterIcons[character.id]}
          </div>
          {playerLabel && (
            <Badge variant="default" className="text-xs">
              {playerLabel}
            </Badge>
          )}
        </div>
        <CardTitle className="text-lg mt-2">{character.nameKo}</CardTitle>
        <CardDescription className="text-xs">{character.name}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-1">
            <Heart className="w-3 h-3 text-red-500" />
            <span>체력: {character.maxHealth}</span>
          </div>
          <div className="flex items-center gap-1">
            <Droplet className="w-3 h-3 text-blue-500" />
            <span>마나: {character.maxMana}</span>
          </div>
          <div className="flex items-center gap-1">
            <Sword className="w-3 h-3 text-orange-500" />
            <span>공격력: {character.attackDamage}</span>
          </div>
          <div className="flex items-center gap-1">
            <Wind className="w-3 h-3 text-green-500" />
            <span>속도: {character.speed}</span>
          </div>
        </div>

        {/* Passive */}
        {character.passive && (
          <div className="bg-muted/50 rounded-md p-2">
            <p className="text-xs font-medium text-muted-foreground">패시브</p>
            <p className="text-xs">{character.passive}</p>
          </div>
        )}

        {/* Skill */}
        <div className="bg-muted/50 rounded-md p-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-blue-600">{character.skill.name}</p>
            <Badge variant="outline" className="text-[10px]">
              마나 {character.skill.manaCost}%
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {character.skill.description}
          </p>
        </div>

        {/* Ultimate */}
        <div className="bg-muted/50 rounded-md p-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-purple-600">{character.ultimate.name}</p>
            <Badge variant="outline" className="text-[10px]">
              궁극기
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {character.ultimate.description}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

const CharacterSelect = ({ onConfirm, onBack }: CharacterSelectProps) => {
  const [currentPlayer, setCurrentPlayer] = useState<1 | 2>(1);
  const [player1Character, setPlayer1Character] = useState<Character | null>(null);
  const [player2Character, setPlayer2Character] = useState<Character | null>(null);

  const characters = Object.values(CHARACTERS);

  const handleCharacterSelect = (character: Character) => {
    if (currentPlayer === 1) {
      setPlayer1Character(character);
    } else {
      setPlayer2Character(character);
    }
  };

  const handleConfirmSelection = () => {
    if (currentPlayer === 1 && player1Character) {
      setCurrentPlayer(2);
    } else if (currentPlayer === 2 && player2Character) {
      onConfirm(player1Character!, player2Character!);
    }
  };

  const handleBack = () => {
    if (currentPlayer === 2) {
      setCurrentPlayer(1);
      setPlayer2Character(null);
    } else {
      onBack();
    }
  };

  const currentSelection = currentPlayer === 1 ? player1Character : player2Character;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">캐릭터 선택</h1>
          <div className="flex items-center justify-center gap-4">
            <div
              className={`px-4 py-2 rounded-lg transition-all ${
                currentPlayer === 1
                  ? 'bg-blue-500 text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              <span className="font-bold">P1</span>
              {player1Character && (
                <span className="ml-2 text-sm">{player1Character.nameKo}</span>
              )}
            </div>
            <span className="text-2xl font-bold text-muted-foreground">VS</span>
            <div
              className={`px-4 py-2 rounded-lg transition-all ${
                currentPlayer === 2
                  ? 'bg-red-500 text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              <span className="font-bold">P2</span>
              {player2Character && (
                <span className="ml-2 text-sm">{player2Character.nameKo}</span>
              )}
            </div>
          </div>
          <p className="text-muted-foreground mt-4">
            플레이어 {currentPlayer}의 캐릭터를 선택하세요
          </p>
        </div>

        {/* Character Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          {characters.map((character) => {
            const isP1Selected = player1Character?.id === character.id;
            const isP2Selected = player2Character?.id === character.id;
            const isCurrentSelected =
              currentPlayer === 1 ? isP1Selected : isP2Selected;

            let playerLabel: string | undefined;
            if (isP1Selected && currentPlayer === 2) playerLabel = 'P1';
            if (isP2Selected && currentPlayer === 1) playerLabel = 'P2';

            return (
              <CharacterCard
                key={character.id}
                character={character}
                isSelected={isCurrentSelected}
                onClick={() => handleCharacterSelect(character)}
                playerLabel={playerLabel}
              />
            );
          })}
        </div>

        {/* Action Buttons */}
        <div className="flex justify-center gap-4">
          <Button variant="outline" size="lg" onClick={handleBack}>
            {currentPlayer === 2 ? 'P1 다시 선택' : '메뉴로 돌아가기'}
          </Button>
          <Button
            size="lg"
            onClick={handleConfirmSelection}
            disabled={!currentSelection}
          >
            {currentPlayer === 1 ? 'P1 선택 완료' : '게임 시작'}
          </Button>
        </div>

        {/* Selected Character Preview */}
        {currentSelection && (
          <div className="mt-8 p-6 bg-card rounded-xl border shadow-lg max-w-2xl mx-auto">
            <div className="flex items-start gap-6">
              <div
                className="w-20 h-20 rounded-xl flex items-center justify-center text-primary-foreground shrink-0"
                style={{ backgroundColor: currentSelection.color }}
              >
                {characterIcons[currentSelection.id]}
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold">{currentSelection.nameKo}</h2>
                <p className="text-muted-foreground">{currentSelection.name}</p>

                <div className="grid grid-cols-4 gap-4 mt-4">
                  <div className="text-center p-2 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground">체력</p>
                    <p className="font-bold text-red-500">{currentSelection.maxHealth}</p>
                  </div>
                  <div className="text-center p-2 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground">마나</p>
                    <p className="font-bold text-blue-500">{currentSelection.maxMana}</p>
                  </div>
                  <div className="text-center p-2 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground">공격력</p>
                    <p className="font-bold text-orange-500">{currentSelection.attackDamage}</p>
                  </div>
                  <div className="text-center p-2 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground">속도</p>
                    <p className="font-bold text-green-500">{currentSelection.speed}</p>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-blue-500" />
                    <span className="text-sm font-medium">스킬:</span>
                    <span className="text-sm text-muted-foreground">
                      {currentSelection.skill.description}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-purple-500" />
                    <span className="text-sm font-medium">궁극기:</span>
                    <span className="text-sm text-muted-foreground">
                      {currentSelection.ultimate.description}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CharacterSelect;
