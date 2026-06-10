import { FlavorEntry } from './types';
import raw from './flavors.json';
import rawScentone from './flavors-scentone.json';

export const FLAVORS: FlavorEntry[] = [...raw as FlavorEntry[], ...rawScentone as FlavorEntry[]];
