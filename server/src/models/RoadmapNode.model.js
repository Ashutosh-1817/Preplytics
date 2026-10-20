import mongoose from 'mongoose';

const roadmapNodeSchema = new mongoose.Schema(
  {
    goalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Goal',
      required: true,
    },

    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RoadmapNode',
      default: null, // null = top-level (Subject)
    },

    level: {
      type: Number,
      required: true,
      enum: [1, 2, 3],
    },

    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [150, 'Title cannot exceed 150 characters'],
    },

    status: {
      type: String,
      enum: ['not_started', 'in_progress', 'completed', 'needs_revision'],
      default: 'not_started',
    },

    order: {
      type: Number,
      required: true,
      default: 0,
    },

    // Recomputed automatically whenever a child is added/removed —
    // never set directly by a user-facing update
    isActionable: {
      type: Boolean,
      default: true, // a freshly created node has no children yet
    },

    estimatedMinutes: {
      type: Number,
      min: 0,
      default: null,
    },

    // Only ever incremented via session-logging (Phase 6), never part
    // of a generic "edit this node" request
    actualMinutesSpent: {
      type: Number,
      min: 0,
      default: 0,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Fast child lookups (building the tree, finding siblings)
roadmapNodeSchema.index({ goalId: 1, parentId: 1 });

// Fast status rollups (progress dashboard, "what's left" queries)
roadmapNodeSchema.index({ goalId: 1, status: 1 });

roadmapNodeSchema.pre('save', async function () {
  if (this.isModified('status')) {
    this.completedAt = this.status === 'completed' ? new Date() : null;
  }
});

// ---------- Statics: tree-aware operations that belong with the model ----------

// Flips a parent's isActionable flag based on whether it currently has
// any children. Called after any create or cascade-delete that changes
// a parent's child count.
roadmapNodeSchema.statics.syncParentActionableStatus = async function (parentId) {
  if (!parentId) return;

  const childCount = await this.countDocuments({ parentId });
  const isActionable = childCount === 0;
  const update = { isActionable };

  // A node that just gained its first child is no longer a real task —
  // any status it picked up while still a leaf is now meaningless and
  // must be cleared, otherwise it displays as permanently "completed"
  // with no way to undo it.
  if (!isActionable) {
    update.status = 'not_started';
  }

  await this.findByIdAndUpdate(parentId, update);
};

// Recursively collects every descendant node id beneath a given node —
// the foundation for cascade delete. Breadth-first, level by level,
// since depth is capped at 3 this is always a cheap, bounded operation.
roadmapNodeSchema.statics.findDescendantIds = async function (nodeId) {
  const descendantIds = [];
  let currentLevelIds = [nodeId];

  while (currentLevelIds.length > 0) {
    const children = await this.find({ parentId: { $in: currentLevelIds } }).select('_id');
    const childIds = children.map((c) => c._id);

    if (childIds.length === 0) break;

    descendantIds.push(...childIds);
    currentLevelIds = childIds;
  }

  return descendantIds;
};

// Deletes a node and its entire subtree in one operation, then syncs
// the (now possibly childless) former parent's isActionable flag.
roadmapNodeSchema.statics.cascadeDelete = async function (nodeId) {
  const node = await this.findById(nodeId);
  if (!node) return null;

  const descendantIds = await this.findDescendantIds(nodeId);
  const allIdsToDelete = [nodeId, ...descendantIds];

  await this.deleteMany({ _id: { $in: allIdsToDelete } });
  await this.syncParentActionableStatus(node.parentId);

  return { deletedCount: allIdsToDelete.length, deletedIds: allIdsToDelete };
};

const RoadmapNode = mongoose.model('RoadmapNode', roadmapNodeSchema);

export default RoadmapNode;