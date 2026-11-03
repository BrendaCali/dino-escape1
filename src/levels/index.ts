import { buildLevel } from './builder';
import { LEVEL_SOURCES } from './levelData';
import type { Level } from '../game/types';

export const LEVELS: Level[] = LEVEL_SOURCES.map(buildLevel);
export const getLevel = (id: number): Level | undefined => LEVELS.find((l) => l.id === id);
