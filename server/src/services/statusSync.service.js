import RoadmapNode from '../models/RoadmapNode.model.js';
import ScheduledTask from '../models/ScheduledTask.model.js';

// Called whenever a ScheduledTask's status changes. Keeps the underlying
// RoadmapNode's status consistent with what actually happened to its task.
export const syncNodeFromTaskStatus = async (task) => {
  const node = await RoadmapNode.findById(task.nodeId);
  if (!node) return; // node may have been cascade-deleted independently

  if (task.status === 'completed') {
    if (node.status !== 'completed') {
      node.status = 'completed';
      await node.save();
    }
    return;
  }

  if (task.status === 'planned') {
    // Reverted back to planned — the node can no longer be 'completed'.
    // Use actualMinutesSpent as the signal for whether any real work has
    // happened on it yet, rather than guessing.
    const nextStatus = node.actualMinutesSpent > 0 ? 'in_progress' : 'not_started';

    if (node.status === 'completed' || node.status !== nextStatus) {
      node.status = nextStatus;
      await node.save();
    }
    return;
  }

  // 'missed' and 'pushed' are schedule-level outcomes, not statements
  // about the work itself — deliberately no node status change here.
};

// Called whenever a RoadmapNode's status is changed directly (e.g. via
// the roadmap tree UI, not through the calendar). Keeps any linked
// ScheduledTask consistent with the node's real state.
export const syncTaskFromNodeStatus = async (node, previousStatus) => {
  if (node.status === previousStatus) return; // no transition, nothing to sync

  if (node.status === 'completed') {
    await ScheduledTask.updateMany(
      { nodeId: node._id, status: { $in: ['planned', 'missed', 'pushed'] } },
      { $set: { status: 'completed' } }
    );
    return;
  }

  if (previousStatus === 'completed' && node.status !== 'completed') {
    // Un-completing a node reopens its task — it's active work again
    await ScheduledTask.updateMany(
      { nodeId: node._id, status: 'completed' },
      { $set: { status: 'planned' } }
    );
  }
};