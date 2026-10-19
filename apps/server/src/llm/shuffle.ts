import { randomInt } from 'node:crypto';

export interface ShuffledOptions {
  options: string[];
  correctIndex: number;
}

export function shuffleOptions(
  options: string[],
  correctIndex: number,
  randomIndex: (exclusiveMax: number) => number = (exclusiveMax) => randomInt(exclusiveMax),
): ShuffledOptions {
  const order = options.map((_option, index) => index);
  for (let position = order.length - 1; position > 0; position -= 1) {
    const swapPosition = randomIndex(position + 1);
    const held = order[position] as number;
    order[position] = order[swapPosition] as number;
    order[swapPosition] = held;
  }
  return {
    options: order.map((originalIndex) => options[originalIndex] as string),
    correctIndex: order.indexOf(correctIndex),
  };
}
