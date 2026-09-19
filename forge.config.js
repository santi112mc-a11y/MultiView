module.exports = {
  packagerConfig: {
    asar: true,
    executableName: "MultiView"
  },
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: {
        name: "MultiView"
      }
    }
  ]
};
