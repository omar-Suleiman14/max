const handlers = new Map();
module.exports = {
  app: { getVersion: () => require('../package.json').version },
  handlers,
  ipcMain: {
    handle: (channel, callback) => handlers.set(channel, callback),
    removeHandler: (channel) => handlers.delete(channel),
  },
};
