// The four-direction skill tree (config/skillTree.ts): owned nodes, what they add up to, and buying.
// Pure functions over GameState.
import { PREPAY_BONUS, TREE, TREE_BY_ID, baseEffects, type TreeEffects, type TreeNode } from '../../config/skillTree';
import type { GameState } from '../state/types';

export function ownsNode(state: GameState, id: string): boolean {
  return id === 'root' || (state.treeNodes ?? []).includes(id);
}

/** Owned nodes other than the anvil. */
export function ownedCount(state: GameState): number {
  return (state.treeNodes ?? []).length;
}

/** Everything the owned nodes give (in tree order, so a later node of a line overrides an earlier one), plus the prepaid-rent bonus. */
export function treeEffects(state: GameState): TreeEffects {
  const e = baseEffects();
  for (const n of TREE) if (n.id !== 'root' && ownsNode(state, n.id)) n.apply(e);
  if (state.rentPrepaid) {
    e.speed += PREPAY_BONUS.speed;
    e.success += PREPAY_BONUS.success;
  }
  return e;
}

/** Shown on the tree: owned nodes and the ones growing straight out of them. */
export function nodeVisible(state: GameState, node: TreeNode): boolean {
  return node.id === 'root' || ownsNode(state, node.id) || (node.from !== null && ownsNode(state, node.from));
}

export type NodeBuyBlock = 'unknown' | 'owned' | 'locked' | 'gold' | 'night';

export function checkBuyNode(state: GameState, id: string): NodeBuyBlock | null {
  const n = TREE_BY_ID[id];
  if (!n || id === 'root') return 'unknown';
  if (ownsNode(state, id)) return 'owned';
  if (state.phase !== 'day') return 'night';
  if (n.from && !ownsNode(state, n.from)) return 'locked';
  if (state.gold < n.cost) return 'gold';
  return null;
}

export function buyNode(prev: GameState, id: string): { ok: true; state: GameState; cost: number } | { ok: false; reason: NodeBuyBlock } {
  const block = checkBuyNode(prev, id);
  if (block) return { ok: false, reason: block };
  const cost = TREE_BY_ID[id].cost;
  return { ok: true, state: { ...prev, gold: prev.gold - cost, treeNodes: [...(prev.treeNodes ?? []), id] }, cost };
}

/** Something on the tree can be bought right now (the forge's button pulses). */
export function anyNodeAffordable(state: GameState): boolean {
  return TREE.some((n) => nodeVisible(state, n) && checkBuyNode(state, n.id) === null);
}

/** Cheapest node not owned yet (for the day-1 hint). */
export function cheapestOpenNode(state: GameState): number {
  return Math.min(...TREE.filter((n) => n.id !== 'root' && nodeVisible(state, n) && !ownsNode(state, n.id)).map((n) => n.cost), Infinity);
}
