{
  self,
  nixpkgs,
  utils,
  fenix,
  android-nixpkgs,
  inputs,
  ...
}:
utils.lib.eachDefaultSystem (
  system:
    import ./outputs/system.nix {
      inherit system nixpkgs fenix android-nixpkgs;
    }
)
