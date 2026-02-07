{
  nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  fenix = {
    url = "github:nix-community/fenix";
    inputs.nixpkgs.follows = "nixpkgs";
  };
  utils.url = "github:numtide/flake-utils";

  android-nixpkgs.url = "github:tadfisher/android-nixpkgs";
}
