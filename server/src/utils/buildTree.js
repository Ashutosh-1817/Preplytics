// Assembles a flat array of RoadmapNode documents (as returned by a single
// query) into a nested tree structure for the frontend. Runs in memory,
// O(n) — cheap at any realistic node count for a single goal.
const buildTree = (flatNodes) => {
  const nodeMap = new Map();
  const roots = [];

  // First pass: index every node by id, give each a children array
  flatNodes.forEach((node) => {
    nodeMap.set(node._id.toString(), { ...node.toObject(), children: [] });
  });

  // Second pass: attach each node to its parent, or to roots if top-level
  flatNodes.forEach((node) => {
    const current = nodeMap.get(node._id.toString());
    const parentId = node.parentId ? node.parentId.toString() : null;

    if (parentId && nodeMap.has(parentId)) {
      nodeMap.get(parentId).children.push(current);
    } else {
      roots.push(current);
    }
  });

  // Sort siblings by `order` at every level
  const sortRecursively = (nodes) => {
    nodes.sort((a, b) => a.order - b.order);
    nodes.forEach((n) => sortRecursively(n.children));
  };
  sortRecursively(roots);

  return roots;
};

export default buildTree;