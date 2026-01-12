// swift-tools-version: 5.9
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

let package = Package(
    name: "AppleSignInKit",
    platforms: [
        .iOS(.v15),
        .macOS(.v12)
    ],
    products: [
        .library(
            name: "AppleSignInKit",
            targets: ["AppleSignInKit"]
        ),
    ],
    dependencies: [],
    targets: [
        .target(
            name: "AppleSignInKit",
            dependencies: [],
            swiftSettings: [
                .enableExperimentalFeature("StrictConcurrency")
            ]
        ),
        .testTarget(
            name: "AppleSignInKitTests",
            dependencies: ["AppleSignInKit"]
        ),
    ]
)
