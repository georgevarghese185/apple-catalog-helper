# Apple Catalog Helper

The idea for making this tool came from [this guide](https://www.insanelymac.com/forum/topic/329828-making-a-bootable-high-sierra-usb-installer-entirely-from-scratch-in-windows-or-linux-mint-without-access-to-mac-or-app-store-installerapp/) which explains how you can create a macOS installer (for hackintosh/vmware) without having to own a macOS device, and instead, download all the required files yourself.

## What does this tool do?
This tool takes a URL to an Apple Catalog XML, shows you the different build versions available in the catalog, and helps you download these required macOS installer files:

1. BaseSystem.dmg
2. BaseSystem.chunklist
3. InstallInfo.plist
4. InstallESDDmg.pkg
5. AppleDiagnostics.dmg
6. AppleDiagnostics.chunklist

## How do I get it?
Go to the [releases](https://github.com/georgevarghese185/apple-catalog-helper/releases) section and download the latest version of the tool for your OS (There are versions for Windows, Linux and Mac)

## How do I use it?
1. Download and extract the tool into some folder
2. Open your command prompt/powershell/terminal
3. `cd` into the folder where you extracted the tool. Eg:

```
cd C:\Users\Me\Desktop\macos-files\
```
* Run the tool by passing it an Apple Catalog URL (eg: use [this]() url for Mojave 10.14 versions)

Windows (Replace the URL with a different one if you need to)
```bat
apple-catalog-helper-1.0.0-win.exe https://swscan.apple.com/content/catalogs/others/index-10.14-10.13-10.12-10.11-10.10-10.9-mountainlion-lion-snowleopard-leopard.merged-1.sucatalog.gz
```

Linux (Replace the URL with a different one if you need to)
```sh
./apple-catalog-helper-1.0.0-linux https://swscan.apple.com/content/catalogs/others/index-10.14-10.13-10.12-10.11-10.10-10.9-mountainlion-lion-snowleopard-leopard.merged-1.sucatalog.gz
```

Mac (Replace the URL with a different one if you need to)
```sh
./apple-catalog-helper-1.0.0-macos https://swscan.apple.com/content/catalogs/others/index-10.14-10.13-10.12-10.11-10.10-10.9-mountainlion-lion-snowleopard-leopard.merged-1.sucatalog.gz
```

5. You will be shown the different build versions found in the provided catalog. You can then choose to either see the download links for the required files (so you can download them yourself) or have the tool download it for you
6. If you chose to have the tool download it for you, give it a path to a folder where you want to download the files and it will start downloading. (The files will be put into a folder named `SharedSupport`)
7. If the download is interrupted, just run the tool again giving the same inputs as last time and it should be able to resume from where it left off.
8. Finally, you will be asked if you want the tool to automatically rename the `InstallESDDmg.pkg` file and update `InstallInfo.plist`. This step is required in the above mentioned macOS guide for creating a bootable macOS installer.
9. Once the tool is done, you can continue with the next steps in the guide for creating a bootable macOS installer.

## How was this tool made?
This tool was written in JavaScript for Node.js and packaged using [`pkg`]() so that it can be run on any system without needing Node.js installed.

The JS code is pretty straightforward. It fetches the given XML, parses it, extracts the download links and then starts downloading the files into the given path.

## How do I set up the project? (Development)
* Have Node.js installed
* Clone this repository using git
* Install npm dependencies:
```
npm ci
```
* Run the script `src/index.js`:
```
npm start
```
or
```
node src/index.js
```
* Build the tool as windows, linux and mac binaries. (Outputs to `./build` directory)
```
npm run build
```

# Credits

Big thanks to [Fusion71au](https://www.insanelymac.com/forum/profile/846696-fusion71au/) from the [InsanelyMac forums](www.insanelymac.com/forum) for making an awesome guide on creating a bootable macOS installer from scratch in Windows for Hackintosh and VMware which gave me the idea to make this tool. This tool doesn't do anything special, it just automates the first few steps in his guide. You can read his complete guides on making a bootable macOS installer for [PC](https://www.insanelymac.com/forum/topic/329828-making-a-bootable-high-sierra-usb-installer-entirely-from-scratch-in-windows-or-linux-mint-without-access-to-mac-or-app-store-installerapp/) and [VMWare](https://www.insanelymac.com/forum/topic/309556-run-vanilla-os-x-el-capitan-sierra-high-sierra-or-mojave-in-vmware-workstation-on-a-windows-host/) to understand what this tool does.