{
  description = "Tauri Javascript App";

  inputs = {
    fenix = {
      url = "github:nix-community/fenix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    utils.url = "github:numtide/flake-utils";
    android-nixpkgs.url = "github:tadfisher/android-nixpkgs";
  };

  outputs =
    {
      self,
      nixpkgs,
      utils,
      fenix,
      android-nixpkgs,
      ...
    }@inputs:
    import ./nix/outputs.nix {
      inherit
        self
        nixpkgs
        utils
        fenix
        android-nixpkgs
        inputs
        ;
    };
}
