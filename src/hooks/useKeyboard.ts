import { useState, useEffect, useCallback, useRef } from 'react';

export interface KeyboardState {
  // Player 1 controls
  w: boolean;
  a: boolean;
  s: boolean;
  d: boolean;
  space: boolean;
  q: boolean;
  e: boolean;
  // Player 2 controls
  arrowUp: boolean;
  arrowDown: boolean;
  arrowLeft: boolean;
  arrowRight: boolean;
  enter: boolean;
  shift: boolean;
  slash: boolean;
}

const initialState: KeyboardState = {
  w: false,
  a: false,
  s: false,
  d: false,
  space: false,
  q: false,
  e: false,
  arrowUp: false,
  arrowDown: false,
  arrowLeft: false,
  arrowRight: false,
  enter: false,
  shift: false,
  slash: false,
};

export const useKeyboard = () => {
  const keysRef = useRef<KeyboardState>(initialState);
  const [keys, setKeys] = useState<KeyboardState>(initialState);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    e.preventDefault();
    const key = e.key.toLowerCase();
    
    let updated = false;
    const newState = { ...keysRef.current };

    switch (key) {
      case 'w':
        if (!newState.w) { newState.w = true; updated = true; }
        break;
      case 'a':
        if (!newState.a) { newState.a = true; updated = true; }
        break;
      case 's':
        if (!newState.s) { newState.s = true; updated = true; }
        break;
      case 'd':
        if (!newState.d) { newState.d = true; updated = true; }
        break;
      case ' ':
        if (!newState.space) { newState.space = true; updated = true; }
        break;
      case 'q':
        if (!newState.q) { newState.q = true; updated = true; }
        break;
      case 'e':
        if (!newState.e) { newState.e = true; updated = true; }
        break;
      case 'arrowup':
        if (!newState.arrowUp) { newState.arrowUp = true; updated = true; }
        break;
      case 'arrowdown':
        if (!newState.arrowDown) { newState.arrowDown = true; updated = true; }
        break;
      case 'arrowleft':
        if (!newState.arrowLeft) { newState.arrowLeft = true; updated = true; }
        break;
      case 'arrowright':
        if (!newState.arrowRight) { newState.arrowRight = true; updated = true; }
        break;
      case 'enter':
        if (!newState.enter) { newState.enter = true; updated = true; }
        break;
      case 'shift':
        if (!newState.shift) { newState.shift = true; updated = true; }
        break;
      case '/':
        if (!newState.slash) { newState.slash = true; updated = true; }
        break;
    }

    if (updated) {
      keysRef.current = newState;
      setKeys(newState);
    }
  }, []);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    
    let updated = false;
    const newState = { ...keysRef.current };

    switch (key) {
      case 'w':
        if (newState.w) { newState.w = false; updated = true; }
        break;
      case 'a':
        if (newState.a) { newState.a = false; updated = true; }
        break;
      case 's':
        if (newState.s) { newState.s = false; updated = true; }
        break;
      case 'd':
        if (newState.d) { newState.d = false; updated = true; }
        break;
      case ' ':
        if (newState.space) { newState.space = false; updated = true; }
        break;
      case 'q':
        if (newState.q) { newState.q = false; updated = true; }
        break;
      case 'e':
        if (newState.e) { newState.e = false; updated = true; }
        break;
      case 'arrowup':
        if (newState.arrowUp) { newState.arrowUp = false; updated = true; }
        break;
      case 'arrowdown':
        if (newState.arrowDown) { newState.arrowDown = false; updated = true; }
        break;
      case 'arrowleft':
        if (newState.arrowLeft) { newState.arrowLeft = false; updated = true; }
        break;
      case 'arrowright':
        if (newState.arrowRight) { newState.arrowRight = false; updated = true; }
        break;
      case 'enter':
        if (newState.enter) { newState.enter = false; updated = true; }
        break;
      case 'shift':
        if (newState.shift) { newState.shift = false; updated = true; }
        break;
      case '/':
        if (newState.slash) { newState.slash = false; updated = true; }
        break;
    }

    if (updated) {
      keysRef.current = newState;
      setKeys(newState);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  return { keys, keysRef };
};
