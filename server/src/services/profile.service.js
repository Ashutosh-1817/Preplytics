import Goal from '../models/Goal.model.js';
import RoadmapNode from '../models/RoadmapNode.model.js';
import Session from '../models/Session.model.js';
import Note from '../models/Note.model.js';
import File from '../models/File.model.js';
import Annotation from '../models/Annotation.model.js';
import Conversation from '../models/Conversation.model.js';
import Notification from '../models/Notification.model.js';
import ScheduledTask from '../models/ScheduledTask.model.js';
import SearchHistory from '../models/SearchHistory.model.js';
import Wrapped from '../models/Wrapped.model.js';
import cloudinary from '../config/cloudinary.js';
import { resolveCloudinaryResourceType } from '../utils/fileType.js';
import { getStreak } from './dashboard.service.js';

// Numbers shown on the profile page
export const getProfileStats = async (userId) => {
  const goals = await Goal.find({ owner: userId }).select('_id status');
  const goalIds = goals.map((g) => g._id);

  const [minutes, sessionCount, topicsCompleted, notes, files, streak] = await Promise.all([
    Session.aggregate([
      { $match: { owner: userId, durationMinutes: { $ne: null } } },
      { $group: { _id: null, total: { $sum: '$durationMinutes' } } },
    ]),
    Session.countDocuments({ owner: userId, durationMinutes: { $ne: null } }),
    goalIds.length
      ? RoadmapNode.countDocuments({ goalId: { $in: goalIds }, isActionable: true, status: 'completed' })
      : 0,
    Note.countDocuments({ owner: userId }),
    File.countDocuments({ owner: userId }),
    getStreak(userId),
  ]);

  return {
    currentStreak: streak.currentStreak,
    longestStreak: streak.longestStreak,
    totalMinutes: minutes[0]?.total ?? 0,
    sessions: sessionCount,
    topicsCompleted,
    activeGoals: goals.filter((g) => g.status === 'active').length,
    totalGoals: goals.length,
    notes,
    files,
  };
};

// Removes everything the user owns. Storage cleanup is best effort: a Cloudinary hiccup must
// not leave a half-deleted account behind.
export const deleteAllUserData = async (userId) => {
  const files = await File.find({ owner: userId }).select('cloudinaryPublicId fileType');
  await Promise.all(
    files.map((f) =>
      cloudinary.uploader
        .destroy(f.cloudinaryPublicId, { resource_type: resolveCloudinaryResourceType(f.fileType) })
        .catch((err) => console.error(`[CLOUDINARY CLEANUP FAILED] ${f.cloudinaryPublicId}`, err.message))
    )
  );

  const goals = await Goal.find({ owner: userId }).select('_id');
  if (goals.length) await RoadmapNode.deleteMany({ goalId: { $in: goals.map((g) => g._id) } });

  await Promise.all(
    [Annotation, Conversation, File, Goal, Note, Notification, ScheduledTask, SearchHistory, Session, Wrapped].map((M) =>
      M.deleteMany({ owner: userId })
    )
  );
};