import connectDB from '../lib/database';
import mongoose from 'mongoose';
import { Project } from '../models/Project';
import { User } from '../models/User';
import { themeTemplates, ThemeTemplateEnum } from '../templates/themeTemplates';
import { ProjectStatus, EXAMPLE_SEED_SCANS } from '@shared/types';

// Resolve the project owner. Pass OWNER_EMAIL to target a specific user
// (use this when running against dev/prod, e.g. your own Entra email). Locally
// it falls back to the real SSO user in the DB, then to the test seed user.
async function resolveOwner() {
  const ownerEmail = process.env.OWNER_EMAIL?.toLowerCase();
  if (ownerEmail) {
    const user = await User.findOne({ email: ownerEmail });
    if (!user) {
      throw new Error(
        `No user found with email "${ownerEmail}". Log in once via the app so the user is created, or check the address.`,
      );
    }
    return user;
  }

  // Without an explicit owner we'd have to guess one — fine locally, but unsafe
  // against a shared/prod database where it could target someone else's account.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'OWNER_EMAIL is required when seeding against a production database, so scans are not assigned to the wrong user.',
    );
  }

  const realUser = await User.findOne({
    entraId: { $nin: ['test-user-id', 'reviewer-user-id', process.env.TEST_USER_ID || 'test-user'] },
  }).sort({ createdAt: -1 });
  if (realUser) return realUser;

  return User.create({ entraId: 'test-user-id', email: 'test@amsterdam.nl', displayName: 'Test User' });
}

async function seedExampleScans() {
  try {
    await connectDB();

    const owner = await resolveOwner();
    console.info(`Seeding example scans for: ${owner.displayName} <${owner.email}>`);

    const themes = themeTemplates[ThemeTemplateEnum.DEFAULT];

    for (const scan of EXAMPLE_SEED_SCANS) {
      // Idempotent, but scoped to a previous *seed* copy: match the distinctive
      // content too, so we never delete a real scan that merely shares the name.
      await Project.deleteMany({
        name: scan.name,
        scanGoal: scan.scanGoal,
        scope: scan.scope,
        createdBy: owner._id,
      });

      const project = await Project.create({
        ...scan,
        status: ProjectStatus.Draft,
        createdBy: owner._id,
        themes,
        users: [{ user: owner._id, role: 'OWNER' }],
      });

      console.info(`  ✅ ${project.name}  (slug: ${project.slug})`);
    }

    console.info(`Done. ${EXAMPLE_SEED_SCANS.length} scans created.`);
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

seedExampleScans();
