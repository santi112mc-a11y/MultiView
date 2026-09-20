module.exports = {
  packagerConfig: {
    asar: true,
    executableName: 'MultiViewV14Test'
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'multiview_v14_test'
      }
    }
  ]
};
