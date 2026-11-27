// The four-direction skill tree (config/skillTree.ts): owned nodes, what they add up to, and buying.
// Pure functions over GameState.
import { FINAL_STARS, TREE, TREE_BY_ID, baseEffects, starPrice, type TreeEffects, type TreeNode } from '../../config/skillTree';
import type { GameState } from '../state/types';
import { applyPerks } from '../../config/rentPerks';

export function ownsNode(state: GameState, id: string): boolean {
  return id === 'root' || (state.treeNodes ?? []).includes(id);
}

/** What star `id` costs right now: the price of the next star learned (more stars learned, higher price). */
export function nodeCost(state: GameState, id: string): number {
  const n = TREE_BY_ID[id];
  if (!n || id === 'root') return 0;
  return starPrice(ownedCount(state) + 1, n.major, FINAL_STARS.has(id));
}

/** Owned nodes other than the anvil. */
export function ownedCount(state: GameState): number {
  return (state.treeNodes ?? []).length;
}

/** Everything the owned nodes give (in tree order, so a later node of a line overrides an earlier one). */
// (2026-11-26: prepaying rent and its speed/success bonus were removed at the user's request.)
export function treeEffects(state: GameState): TreeEffects {
  const e = baseEffects();
  for (const n of TREE) if (n.id !== 'root' && ownsNode(state, n.id)) n.apply(e);
  applyPerks(e, state.perks); // 왕의 하사품 add onto the same effects (2026-11-27)
  return e;
}

/** Shown on the tree: owned nodes and the ones growing straight out of them. */
export function nodeVisible(state: GameState, node: TreeNode): boolean {
  return node.id === 'root' || ownsNode(state, node.id) || (node.from !== null && ownsNode(state, node.from));
}

// 'day': stars are learned only once the day's work is over, from the evening screen
// (user 2026-11-27: "스킬트리는 밤넘어갔을때만 찍을수있게"). In the forge the tree is view-only.
export type NodeBuyBlock = 'unknown' | 'owned' | 'locked' | 'gold' | 'night' | 'day';

export function checkBuyNode(state: GameState, id: string, atEvening = true): NodeBuyBlock | null {
  const n = TREE_BY_ID[id];
  if (!n || id === 'root') return 'unknown';
  if (ownsNode(state, id)) return 'owned';
  if (state.phase !== 'day') return 'night';
  if (!atEvening) return 'day';
  if (n.from && !ownsNode(state, n.from)) return 'locked';
  if (state.gold < nodeCost(state, id)) return 'gold';
  return null;
}

export function buyNode(prev: GameState, id: string, atEvening = true): { ok: true; state: GameState; cost: number } | { ok: false; reason: NodeBuyBlock } {
  const block = checkBuyNode(prev, id, atEvening);
  if (block) return { ok: false, reason: block };
  const cost = nodeCost(prev, id);
  return { ok: true, state: { ...prev, gold: prev.gold - cost, treeNodes: [...(prev.treeNodes ?? []), id] }, cost };
}

/** Something on the tree can be bought right now (the forge's button pulses). */
export function anyNodeAffordable(state: GameState): boolean {
  return TREE.some((n) => nodeVisible(state, n) && checkBuyNode(state, n.id) === null);
}

/** Cheapest node not owned yet (for the day-1 hint). */
export function cheapestOpenNode(state: GameState): number {
  return Math.min(...TREE.filter((n) => n.id !== 'root' && nodeVisible(state, n) && !ownsNode(state, n.id)).map((n) => nodeCost(state, n.id)), Infinity);
}
