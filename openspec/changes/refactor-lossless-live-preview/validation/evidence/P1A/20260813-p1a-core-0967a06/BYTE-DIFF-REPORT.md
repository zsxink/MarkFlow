# Fixture hash + L1 interval report (P1A Core run 20260813-p1a-core-0967a06)

| fixture | len | sha256 | eol | trailing | l1 intents |
|---|---|---|---|---|---|
| utf8-lf-tail0 | 66 | `b8ada2a7b0e544abde49ce047b911c3d9838a51422f5e2cb4781ee12a3a4a5c5` | lf | 0 | 4 |
| utf8-lf-tail1 | 67 | `52a435d76c69c819c3b16972bca4214984a4c19f906a2ade440c025e471f3fdc` | lf | 1 | 5 |
| utf8-lf-tail2 | 68 | `bc1b50f45486243a37bf171b07da6bd34905835b8ae2c82010491f13eef231a0` | lf | 2 | 5 |
| utf8-lf-tail3 | 69 | `201dc08c2f7e700f66903559ca88398256f582d5bbd3394627d2cab17d6c6bd1` | lf | 3 | 5 |
| utf8-crlf-tail1 | 71 | `262aa53ae6984dc1299336bdcd0137ef4f616f022fc9fe63f280c32368aebd5c` | crlf | 1 | 5 |
| utf8-crlf-tail2 | 73 | `6928ce6518b78c454a84fdd0296563cdbf815e34bc67048c6451bbe4e6bcbafb` | crlf | 2 | 5 |
| utf8-crlf-tail3 | 75 | `db562fc521f4ff93c530de24139cc7161a522d12f65948219dfc26b6fb6cc42a` | crlf | 3 | 5 |
| utf8-cr-tail1 | 67 | `3e505e2c736942f615b6070bb561442271035453390544cf27f57d34642c0879` | cr | 1 | 5 |
| utf8-mixed-tail2 | 91 | `0a892d540a04d1b306768be51e56b90f89dce7d649f76d0fe87712a9053e3f85` | mixed | 2 | 5 |
| utf8-bom-lf-tail2 | 71 | `c7d99fe8fa174dabd66a7be7463cc17d4475272432cf640fb177de53557d92fd` | lf | 2 | 5 |
| empty | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | none | 0 | 1 |
| bom-only | 3 | `f1945cd6c19e56b3c1c78943ef5ec18116907a4ca1efc40a57d48ab1db7adfc5` | none | 0 | 1 |
| newlines-only | 3 | `6a3cf5192354f71615ac51034b3e97c20eda99643fcaf5bbe6d41ad59bd12167` | lf | 3 | 2 |
| spaces-only | 6 | `52d8194d6705aedb21ccffe6965db6913d277d3d259ad5f071f38034e8aa7f52` | none | 0 | 1 |
| unicode-cjk | 102 | `d5ccc8920e626890beb4074f7d3edd28dd78e02144786d39a2d753f2ba6b2c95` | lf | 2 | 5 |
| unicode-emoji | 92 | `5466f6833170d5923a67a721110534460ab690069263d9734e1927456f97338b` | lf | 2 | 4 |
| unicode-combining | 88 | `db3a90e6287fef4445ca6fee4cc57fb5935aa08a5b59787c635eb29c518868d8` | lf | 2 | 4 |
| syntax-lists | 120 | `b6a683596bc16e83ed02584af26cfcb74c454e6048012160195371b082eb4df8` | lf | 2 | 4 |
| syntax-fence | 80 | `5b0b7280306de9e7e775b4fbc751e584cfd5a4fb1db9d7b06d21aa34b700368d` | lf | 2 | 4 |
| syntax-frontmatter | 92 | `d298cb82a277b66abe81e6b64dceae71c5e8c1571256909ae3d578bf8614616d` | lf | 2 | 4 |
| syntax-table-reference-footnote | 127 | `a0d1b76f9a4d3811f5960379ea61d61f84cd89abc24c21bfb9f5b9960813405f` | lf | 2 | 4 |
| syntax-html | 81 | `daa8c887c1bb4149b7bff33e00a7e4ed3c9c4e0a65a9de35e19199253ccda1d0` | lf | 2 | 4 |
| syntax-image-blanklines | 40 | `1405f11cd7dd713510577201d95c99b2f6cebbebfba4472c5fe80966857d4ac0` | lf | 3 | 4 |
| malformed | 97 | `bad0e9ced2c588b80322ce356b6effb19493e3fc787c5b56d237f30938996b1d` | lf | 2 | 4 |

L0：24 fixtures 全部零 patch prepare-save == 原始 bytes，SHA-256 与 manifest 一致。
L1：95 intents 全部 saved == oracle(raw splice)，prefix/suffix/BOM/trailing 逐字节断言通过。
P0 harness 参照：L1 positive 95 / negative 93 全 PASS。
