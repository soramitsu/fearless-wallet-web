// macOS-only custody helper for the Chrome Web Store upload key.
// Private material is confined to Keychain and process memory. See the runbook.
import Foundation
import Security
import CryptoKit
import Darwin

let itemID = "nhlnehondigmgckngjomcpcefcdplmgc"
let keyTag = "jp.co.soramitsu.fearless.chrome-upload.\(itemID).v1"
let backupService = "jp.co.soramitsu.fearless.chrome-upload.backup"
let custodyDirectory = FileManager.default.homeDirectoryForCurrentUser
    .appendingPathComponent("Library/Application Support/Fearless Wallet/Chrome Upload Signing")
let publicURL = custodyDirectory.appendingPathComponent("upload-public-key.pem")
let backupURL = custodyDirectory.appendingPathComponent("upload-key.encrypted.json")
let backupAAD = Data("Fearless Chrome upload key backup v1:\(keyTag)".utf8)

struct Failure: Error, CustomStringConvertible {
    let description: String
    init(_ message: String) { description = message }
}

func checked(_ status: OSStatus, _ operation: String) throws {
    guard status == errSecSuccess else {
        throw Failure("\(operation) failed (OSStatus \(status))")
    }
}

func randomData(_ length: Int) throws -> Data {
    var bytes = Data(count: length)
    let status = bytes.withUnsafeMutableBytes { SecRandomCopyBytes(kSecRandomDefault, length, $0.baseAddress!) }
    try checked(status, "Secure random generation")
    return bytes
}

func external(_ key: SecKey) throws -> Data {
    var error: Unmanaged<CFError>?
    guard let data = SecKeyCopyExternalRepresentation(key, &error) else {
        throw Failure("Key representation unavailable")
    }
    return data as Data
}

func publicKey(_ key: SecKey) throws -> SecKey {
    guard let result = SecKeyCopyPublicKey(key) else { throw Failure("Public key unavailable") }
    return result
}

func der(_ tag: UInt8, _ body: Data) -> Data {
    var length = body.count
    var bytes: [UInt8] = []
    repeat { bytes.insert(UInt8(length & 255), at: 0); length >>= 8 } while length != 0
    let header: [UInt8] = body.count < 128 ? [tag, UInt8(body.count)] : [tag, 0x80 | UInt8(bytes.count)] + bytes
    return Data(header) + body
}

func spki(_ key: SecKey) throws -> Data {
    let algorithm = Data([0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00])
    return der(0x30, algorithm + der(0x03, Data([0]) + (try external(publicKey(key)))))
}

func fingerprint(_ bytes: Data) -> String {
    SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined()
}

func sign(_ input: Data, _ key: SecKey) throws -> Data {
    var error: Unmanaged<CFError>?
    guard let result = SecKeyCreateSignature(key, .rsaSignatureMessagePKCS1v15SHA256, input as CFData, &error) else {
        throw Failure("Keychain signing failed")
    }
    guard SecKeyVerifySignature(try publicKey(key), .rsaSignatureMessagePKCS1v15SHA256, input as CFData, result, &error) else {
        throw Failure("Signature self-check failed")
    }
    return result as Data
}

func generateKey(permanent: Bool) throws -> SecKey {
    var attributes: [String: Any] = [kSecAttrKeyType as String: kSecAttrKeyTypeRSA, kSecAttrKeySizeInBits as String: permanent ? 3072 : 2048]
    if permanent {
        attributes[kSecPrivateKeyAttrs as String] = [
            kSecAttrIsPermanent as String: true,
            kSecAttrSynchronizable as String: false,
            kSecAttrApplicationTag as String: Data(keyTag.utf8),
            kSecAttrLabel as String: "Fearless Chrome Web Store upload signing v1"
        ]
    }
    var error: Unmanaged<CFError>?
    guard let key = SecKeyCreateRandomKey(attributes as CFDictionary, &error) else {
        throw Failure("RSA key generation failed")
    }
    return key
}

func loadKey(create: Bool = false) throws -> SecKey {
    let query: [String: Any] = [
        kSecClass as String: kSecClassKey, kSecAttrKeyType as String: kSecAttrKeyTypeRSA,
        kSecAttrKeyClass as String: kSecAttrKeyClassPrivate, kSecAttrApplicationTag as String: Data(keyTag.utf8),
        kSecAttrSynchronizable as String: false,
        kSecReturnRef as String: true, kSecMatchLimit as String: kSecMatchLimitOne
    ]
    var result: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    if status == errSecItemNotFound && create {
        guard !FileManager.default.fileExists(atPath: publicURL.path),
              !FileManager.default.fileExists(atPath: backupURL.path) else {
            throw Failure("Signing key is missing but custody files exist. Recover the enrolled key; do not generate a replacement.")
        }
        return try generateKey(permanent: true)
    }
    try checked(status, "Load signing key")
    guard let result, CFGetTypeID(result) == SecKeyGetTypeID() else { throw Failure("Invalid signing-key reference") }
    return (result as! SecKey)
}

func backupSecret(create: Bool = false) throws -> Data {
    let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: backupService, kSecAttrAccount as String: keyTag,
        kSecAttrSynchronizable as String: false
    ]
    var read = query
    read[kSecReturnData as String] = true
    read[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    let status = SecItemCopyMatching(read as CFDictionary, &result)
    if status == errSecItemNotFound && create {
        let secret = try randomData(32)
        var add = query
        add[kSecValueData as String] = Data(secret.base64EncodedString().utf8)
        add[kSecAttrLabel as String] = "Fearless Chrome upload backup encryption key v1"
        try checked(SecItemAdd(add as CFDictionary, nil), "Store backup encryption key")
        return secret
    }
    try checked(status, "Load backup encryption key")
    guard let encoded = result as? Data, let text = String(data: encoded, encoding: .utf8),
          let secret = Data(base64Encoded: text), secret.count == 32 else {
        throw Failure("Invalid backup encryption key")
    }
    return secret
}

struct Backup: Codable {
    let version: Int
    let algorithm: String
    let privateKeyFormat: String
    let keychainService: String
    let keychainAccount: String
    let publicKeySha256: String
    let sealedBoxBase64: String
}

func seal(_ key: SecKey, _ secret: Data) throws -> Backup {
    var privateBytes = try external(key)
    defer { privateBytes.resetBytes(in: 0..<privateBytes.count) }
    let sealed = try AES.GCM.seal(privateBytes, using: SymmetricKey(data: secret), authenticating: backupAAD)
    guard let combined = sealed.combined else { throw Failure("Cannot serialize encrypted backup") }
    return Backup(version: 1, algorithm: "AES-256-GCM", privateKeyFormat: "PKCS1-DER",
                  keychainService: backupService, keychainAccount: keyTag,
                  publicKeySha256: fingerprint(try spki(key)), sealedBoxBase64: combined.base64EncodedString())
}

func verifyBackup(_ backup: Backup, _ secret: Data, _ expected: SecKey) throws {
    guard backup.version == 1, backup.algorithm == "AES-256-GCM", backup.privateKeyFormat == "PKCS1-DER",
          backup.keychainService == backupService, backup.keychainAccount == keyTag,
          backup.publicKeySha256 == fingerprint(try spki(expected)),
          let combined = Data(base64Encoded: backup.sealedBoxBase64), combined.count < 16384 else {
        throw Failure("Backup metadata does not match the signing key")
    }
    let sealed = try AES.GCM.SealedBox(combined: combined)
    var privateBytes = try AES.GCM.open(sealed, using: SymmetricKey(data: secret), authenticating: backupAAD)
    defer { privateBytes.resetBytes(in: 0..<privateBytes.count) }
    var error: Unmanaged<CFError>?
    let attributes: [String: Any] = [kSecAttrKeyType as String: kSecAttrKeyTypeRSA, kSecAttrKeyClass as String: kSecAttrKeyClassPrivate]
    guard let restored = SecKeyCreateWithData(privateBytes as CFData, attributes as CFDictionary, &error),
          try spki(restored) == spki(expected) else { throw Failure("Encrypted backup restores a different key") }
    let challenge = try randomData(64)
    let signature = try sign(challenge, restored)
    guard SecKeyVerifySignature(try publicKey(expected), .rsaSignatureMessagePKCS1v15SHA256,
                               challenge as CFData, signature as CFData, &error) else { throw Failure("Backup recovery proof failed") }
}

func regularFile(_ url: URL, maximum: Int = 16384) throws -> Data {
    let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
    guard attributes[.type] as? FileAttributeType == .typeRegular,
          let size = attributes[.size] as? NSNumber, size.intValue <= maximum else { throw Failure("Input must be a bounded regular file") }
    return try Data(contentsOf: url)
}

func writeExclusive(_ data: Data, _ url: URL) throws {
    let descriptor = open(url.path, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, S_IRUSR | S_IWUSR)
    guard descriptor >= 0 else { throw Failure("Refusing to overwrite or follow output: \(url.path)") }
    let handle = FileHandle(fileDescriptor: descriptor, closeOnDealloc: true)
    try handle.write(contentsOf: data)
    try handle.synchronize()
    try handle.close()
}

func initialize() throws {
    try FileManager.default.createDirectory(at: custodyDirectory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
    let attributes = try FileManager.default.attributesOfItem(atPath: custodyDirectory.path)
    guard attributes[.type] as? FileAttributeType == .typeDirectory,
          (attributes[.ownerAccountID] as? NSNumber)?.uint32Value == getuid() else { throw Failure("Custody directory must be owned by this user and not a symlink") }
    try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: custodyDirectory.path)
    let key = try loadKey(create: true)
    var secret = try backupSecret(create: true)
    defer { secret.resetBytes(in: 0..<secret.count) }
    if FileManager.default.fileExists(atPath: backupURL.path) {
        try verifyBackup(JSONDecoder().decode(Backup.self, from: regularFile(backupURL)), secret, key)
    } else {
        let backup = try seal(key, secret)
        try verifyBackup(backup, secret, key)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        try writeExclusive(encoder.encode(backup), backupURL)
    }
    let publicBytes = try spki(key)
    let base64 = publicBytes.base64EncodedString()
    let lines = stride(from: 0, to: base64.count, by: 64).map { offset -> String in
        let start = base64.index(base64.startIndex, offsetBy: offset)
        return String(base64[start..<base64.index(start, offsetBy: min(64, base64.count - offset))])
    }
    let pem = Data(("-----BEGIN PUBLIC KEY-----\n" + lines.joined(separator: "\n") + "\n-----END PUBLIC KEY-----\n").utf8)
    if FileManager.default.fileExists(atPath: publicURL.path) {
        guard try regularFile(publicURL) == pem else { throw Failure("Existing public key does not match Keychain") }
    } else { try writeExclusive(pem, publicURL) }
    print("Public key: \(publicURL.path)\nSHA-256: \(fingerprint(publicBytes))\nEncrypted backup: \(backupURL.path)\nBackup recovery: verified\nPrivate key: macOS Keychain (local, not synchronized)")
}

func selfTest() throws {
    let key = try generateKey(permanent: false)
    let secret = try randomData(32)
    let backup = try seal(key, secret)
    try verifyBackup(backup, secret, key)
    let wrongSecret = try randomData(32)
    var rejected = false
    do { try verifyBackup(backup, wrongSecret, key) } catch { rejected = true }
    guard rejected else { throw Failure("Backup accepted the wrong encryption key") }
    let message = Data("CRX3 Keychain interoperability test".utf8)
    let signature = try sign(message, key)
    var error: Unmanaged<CFError>?
    guard !SecKeyVerifySignature(try publicKey(key), .rsaSignatureMessagePKCS1v15SHA256,
                                Data("tampered".utf8) as CFData, signature as CFData, &error) else { throw Failure("Signature accepted tampered data") }
    print("PASS: ephemeral RSA signing, tamper rejection, encrypted backup recovery, wrong backup key rejection")
}

do {
    let arguments = Array(CommandLine.arguments.dropFirst())
    switch arguments.first {
    case "self-test" where arguments.count == 1: try selfTest()
    case "initialize" where arguments.count == 1: try initialize()
    case "verify-backup" where arguments.count == 1:
        try verifyBackup(JSONDecoder().decode(Backup.self, from: regularFile(backupURL)), backupSecret(), loadKey())
        print("Encrypted backup recovery: verified")
    case "sign" where arguments.count == 3:
        let key = try loadKey()
        let input = try regularFile(URL(fileURLWithPath: arguments[1]), maximum: 512 * 1024 * 1024 + 1024)
        let context = Data("CRX3 SignedData\0".utf8)
        let expectedPrefix = context + Data([18, 0, 0, 0, 0x0a, 0x10]) + Data(SHA256.hash(data: try spki(key))).prefix(16)
        guard input.starts(with: expectedPrefix), input.count > expectedPrefix.count + 22,
              input[expectedPrefix.count..<expectedPrefix.count + 4] == Data([0x50, 0x4b, 3, 4]) else {
            throw Failure("Only CRX3 payloads for this upload key can be signed")
        }
        try writeExclusive(sign(input, key), URL(fileURLWithPath: arguments[2]))
        print("CRX3 payload signed with local Keychain key; signature verified")
    default: throw Failure("Usage: chrome-upload-keychain self-test|initialize|verify-backup|sign INPUT OUTPUT")
    }
} catch {
    fputs("Error: \(error)\n", stderr)
    exit(1)
}
