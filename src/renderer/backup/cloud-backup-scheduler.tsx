import { useEffect, useRef } from 'react';

import { useAuth } from '../auth/auth-context';
import { readCloudBackupEnabled } from '../auth/cloud-backup-preference';

/**
 * Runs the workspace's backup schedule against Max Cloud once, shortly after
 * somebody who has opted in and signed in opens Max.
 *
 * The interval itself lives in the main process: `runScheduled` refuses to run
 * if a successful cloud backup already happened inside the window, so opening
 * Max five times in an afternoon still produces one daily backup. This renders
 * nothing and, when cloud backup is off or nobody is signed in, does nothing at
 * all, so a Max with no account never reaches the network because of it.
 */
export function CloudBackupScheduler() {
  const { getToken, isSignedIn } = useAuth();
  const alreadyRan = useRef(false);

  useEffect(() => {
    if (alreadyRan.current || !isSignedIn || !readCloudBackupEnabled(window.localStorage)) return;
    alreadyRan.current = true;

    const run = async () => {
      const status = await window.maxApi.cloudBackups.getStatus();
      if (!status.configured) return;

      const schedule = (await window.maxApi.shop.getMetadata()).backupSchedule;
      if (schedule !== 'daily' && schedule !== 'weekly') return;

      const token = await getToken();
      if (!token) return;

      await window.maxApi.cloudBackups.runScheduled(token, schedule);
    };

    // A scheduled backup is a background convenience. It must never surface an
    // error over whatever the person is actually doing, and the main process
    // has already written a diagnostic line naming the step that failed.
    void run().catch(() => undefined);
  }, [getToken, isSignedIn]);

  return null;
}
