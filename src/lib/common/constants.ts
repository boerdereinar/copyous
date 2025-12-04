import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import type { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import type { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

export const ItemType = {
	Text: 'Text',
	Code: 'Code',
	Image: 'Image',
	File: 'File',
	Files: 'Files',
	Link: 'Link',
	Character: 'Character',
	Color: 'Color',
} as const;

export type ItemType = (typeof ItemType)[keyof typeof ItemType];

export const ItemTypes = [
	ItemType.Text,
	ItemType.Code,
	ItemType.Image,
	ItemType.File,
	ItemType.Files,
	ItemType.Link,
	ItemType.Character,
	ItemType.Color,
] as const;

export const Tag = {
	Blue: 'blue',
	Teal: 'teal',
	Green: 'green',
	Yellow: 'yellow',
	Orange: 'orange',
	Red: 'red',
	Pink: 'pink',
	Purple: 'purple',
	Slate: 'slate',
} as const;

export type Tag = (typeof Tag)[keyof typeof Tag];

export const Tags = [
	Tag.Blue,
	Tag.Teal,
	Tag.Green,
	Tag.Yellow,
	Tag.Orange,
	Tag.Red,
	Tag.Pink,
	Tag.Purple,
	Tag.Slate,
] as const;

export const ActiveState = {
	None: 0,
	Focus: 1,
	Hover: 2,
	FocusHover: 3,
	Active: 4,
} as const;

export type ActiveState = (typeof ActiveState)[keyof typeof ActiveState];

export const ClipboardHistory = {
	Clear: 0,
	KeepPinnedAndTagged: 1,
	KeepAll: 2,
} as const;

export type ClipboardHistory = (typeof ClipboardHistory)[keyof typeof ClipboardHistory];

export const DefaultColors = {
	'custom-bg-color': ['rgb(54,54,58)', 'rgb(250,250,251)'],
	'custom-fg-color': ['rgb(255,255,255)', 'rgb(34,34,38)'],
	'custom-card-bg-color': ['rgb(71,71,76)', 'rgb(255,255,255)'],
	'custom-search-bg-color': ['rgb(71,71,76)', 'rgb(255,255,255)'],
} as const;

export const UserAgent = 'Mozilla/5.0 (compatible; CopyousBot/1.0; +https://github.com/boerdereinar/copyous)';

export const HljsCdns = [
	'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/es',
	'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.11.1/build/es',
	'https://unpkg.com/@highlightjs/cdn-assets@11.11.1/es',
];

export const HljsUrls = HljsCdns.map((cdn) => `${cdn}/highlight.min.js`);

export const HljsSha512 =
	'f35f24636b981f53d194735964bd7b8606c79e0f4b04e800e24f13415b1761368ac20839a4cc416a1c5e1c351d00c4cf509f360972d098964e97739050a675f1';

// https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/es/languages/${language}.min.js
// prettier-ignore
export const HljsLanguages: [string, string, string][] = [
	["1c",             "1C",                      "46b64c3cb1134c3ca2a060955039748296d7f0b1671e06986feab0a1ec374939a4ade2cf740fb14fa9d9916c4194860e3bb237a417483856625c742874a1a7bd"],
	["abnf",           "ABNF",                    "0e1f0474d64abf39470ccc687bd3363df1587ed2773a6cd00f102409c8a59c3adcc81bf5fef8c1875a7e3de5764e0a9ca148a143cba52e878fdb549acc550562"],
	["accesslog",      "Access Logs",             "5604f78544cd83b442cc86d3349544dd8f23406e73c5dd9ac6e9a0c1e1f8e6c90a4981b168021e18f5ac688745549bbce73cb4541661105edd2861ebeac6d250"],
	["actionscript",   "ActionScript",            "24f5e5590d3365c557be91f47ec0b92ae28d34b3a93ce3919d622a163500f0f006b3c4c1ae2abf3101753ce6c60d59cb8bd4678701d3ff27ecffc0f65fd97d7d"],
	["ada",            "Ada",                     "14025d73be63e8ddad953e9bafaf4eb198a0676a36c3336d2fa0fb60247178dac7073be4a7df7832f6d5507b3cb542f6a0d1c7f598503cc2fdb5fbe89ff5cd9f"],
	["angelscript",    "AngelScript",             "1973874eb55f6e3cb895bf5449c6daf3c5b88324e00dd12bd93eb0f969d5343552ff7229fe5490f123c341ea1839ca680fa76b4419cb7e30aee0e431820ee532"],
	["apache",         "Apache",                  "a9a10c235e66e1c755e24110fe165913ea20095fcce64d8a4fc8c406dd1c095c3d18b798bad43babe4c090233858cc6de531bba245a02b661230e9378d283a9d"],
	["applescript",    "AppleScript",             "7f2c12e3dce10e3ceb4907f21d62df48416fa325d54256377fd6172bec38a8c0daad26c07cc6da9fec267b37bb82f0265a66fbc9e1fd18765776be9d7c49d8d2"],
	["arcade",         "Arcade",                  "559ec8ea68d8d5542fa1665049ed97accd88b93264813e848bf83395499bcf8e5e15399d0cd607d8c34e97b04aa2571d334e5bcba129aa2b0cd51c0209c030bf"],
	["arduino",        "Arduino",                 "984d2c30b3ebc5190bda182968223df469e1e27bbbe7c0cb23f11c5be0b827b164bc52692f482e05c4898c46136956b4c844366b4fe5f8e36d943074aa7521d7"],
	["armasm",         "ARM Assembler",           "b4ad5f36a4c46ff783e3a63b761ab2d72f8489b5443ee2b39dbe8c54382cd4a0d8cc6d057e6a62ecb4c309ee3d0ae58c56d32ab7da2f0340de6b73b22799f5db"],
	["asciidoc",       "AsciiDoc",                "9bafafbcd1c2b3038499136d1a6c2ddad2f67f4f6a879d0579b7d085b44fc73a37f38b135a103e6a7f68982e38dfcc39c6a9667b54c5c8b542e915a7e9e2e66d"],
	["aspectj",        "AspectJ",                 "1c9710554b816c8d5a014af69cb5acdb5768c4296da2097c62f955505e47be1b26af719dbece2fb0cd417efa093e7ec6ee2dc5cc79d4f3feba1e9ec82e12dd94"],
	["autohotkey",     "AutoHotkey",              "d10465788783f9367e952966d7da71f5d9981596b37ba7154935e53afec211fa8291a186d97037562bf39e64c0d2ee081810b678e2a57993c4574e49b5024bbf"],
	["autoit",         "AutoIt",                  "a3f2e46b5a5ccd1784ee460ecb26d407c7a2fc6ba214dcb9b6e5393caeb99c0208d5e427e426e9972cdb2f4c35c92c4635222d07f103ed96a77b4d796c01c2ad"],
	["avrasm",         "AVR Assembler",           "16a5a97434449caad3fa499dbb4b872f5e85b33d8c81dc2242f553973b39fc081d7991b7b4b236b33c66e31f63f1cc82c8caeb37676a4decccfa1fd1952673cb"],
	["awk",            "Awk",                     "9f4737e769510b4ba93a942807046f9df602eaca96eaa0fbcc610efce1d40c90a3c6fa8ed7f0c18f2386b94478e08c461e8985b5386428058675562147e69d65"],
	["bash",           "Bash",                    "cd94b428651c9b6d9a6e3f1dbe26b0f6d6b8965af7e559cd6bba6a9c0b2859d40cbbc8ea1f83d42598a6673033614ea44a4ba1f99084f33ad3cfeec6c25570ac"],
	["basic",          "Basic",                   "8ba1488598dd9584bef5aedbccd4830546059c67b6e7c83033f0ffa17d0b95c2513700629611528882d74f360c6e29fb318d5337493efdb4a4d934c174aa978b"],
	["bnf",            "BNF",                     "b96353648ae80c4f573aa06695a6ca7786f4634425f8b8702dfac4119011b1d6e9724d67b607f2b637da422c759273bf8568ccaa5b158bdf7fa149a7614646c3"],
	["brainfuck",      "Brainfuck",               "76b10d2bcf3a4e46ad41d897043fa05637a2785d9aebc3a1e71995ce9f1474dbc81c45b905231c6546873a339b9ba7cfb9f9843556fc15ed0c5a7aabe0f1b075"],
	["c",              "C",                       "c4b157d7316c3c202fbdf720089efc0e7b6f9067ca9eaf4001e5cf8f74823840e4c05c8fed1f2df9da8b8d3e7da2fdc89bcce898382176fbcbb85b35dfb4166c"],
	["cal",            "C/AL",                    "19df9519db3d6ff89bb8668679b0ca02ad19b619855d9f26e42dd5c8394fd4a3bc214d5dd601db461c43698dda531091b96f1036e28d72b02c14580d8bc72238"],
	["capnproto",      "Cap'n Proto",             "cc6e136872c013a12cc484d7108b68accc9b44d6de9d44f03fb92c7522335cfee9aa4ebc397b6babf38d820cf1ac2f3d707f1fb51a2403fb08aec90aeaae037d"],
	["ceylon",         "Ceylon",                  "a0fb1932712692bb082fe78d50192617a6e335ae022440ff51264e084c27ab88b9c1212b988374eac91bc3179adf5a0f534e8cf6efd2bb96d9d5a890e00faeb3"],
	["clean",          "Clean",                   "e6f03fdb39a01f3a1fbbe9c21a462f15fe7b4a29c07cb7f181befa7f05154b81cda1fdf3d544263dd1d4c5050350d7b12d62884efd4b57fa365d6e45221c6947"],
	["clojure-repl",   "Clojure REPL",            "df90bc82ea9446add1a4a070009d0a6b2c503b067784b63c5ed2601d5ebe6748bc9f03406a9a0e19aaa96bf3590c9c93fcfef4b731702880d87f65a125883749"],
	["clojure",        "Clojure",                 "0fd1a0247c15c41662e003d020e742bfe6390393ef7056fd3b195da9ce2ba100cb1da98b5dc767db71efbfd78d86491cbb11aa45e9e09445a28eab129d0419c0"],
	["cmake",          "CMake",                   "b62adc9b0a2c26d259d6c8a2f323e467e123122f921a750e24dc0ca82d9bb500be57ad2f194d1da743c7a59da113d1b9be3439fd56eb234fc926697d33fcafb5"],
	["coffeescript",   "CoffeeScript",            "965ead6eb3fb5e31f1db8d4605ed6c836d68e05626df6e97f5f99b8354cf7973a2e59e528303f0fd00affa7f0ccc2dc15a862ad092dddc06eb65cebf34230f31"],
	["coq",            "Coq",                     "bed063703ce33a84fec0cd5c1a04defd449836749efd637520862c6f1cb913bf1be20d5593bb7c705a8afd3a6db60d0a7c6fe824864b56869f79eac672f6d61f"],
	["cos",            "Cache Object Script",     "039b4f3888f1b31ef4edb0a5e77d4fe755e6ec2b7d0fa25e0e9517402a69c43fa2023f1a85afa4640bdd565f4df6a249886ff6f31f7e38e933cf74a0002bacae"],
	["cpp",            "C++",                     "f769409c5ed3508da8e8892c49a012ac9a9e634c97dc3f78fd9a282422219fcbabb3ceec8f6bb8e50d6d4077885e47766b5449e818a5845a5e8761c106ac1544"],
	["crmsh",          "Crmsh",                   "477de056cf05bf634fab3168832bc11197c6f9afabdee903c6d83b6c816e1919a3a1e6abe1dacf42a3255ccaee350b976d3abb3ba3fe2bd0216d0f93eceb1153"],
	["crystal",        "Crystal",                 "0fdc7679d0628afd6262344b45fd2c236dc34474902a1fbb4904f8d7961dbdf4d8f13904cdc6ae34f8baf3b95c06e154b9cf3a75ee71c7cb9acd39ee7bfcb617"],
	["csharp",         "C#",                      "9ed4270c0bc578bfb2f6292d1710c1e823540f3d0c9b03cde1e2c2f202dda24be028f2f532e1eea61a7da0aeaef78e641de917b4fc441ce3a37054b87fbbfe4f"],
	["csp",            "CSP",                     "82503a3b87c9eea04e4699022b17bf576ab733511b19f956a9f1e76ce2ecdc368f5c984ea828d3e447e3ffa77c47a246c9525ee2df50ae289775737e78dab0e3"],
	["css",            "CSS",                     "01f04694a33455de2e901238c56dbe837494358484e5caabe87b73b035a481f0ce2571c77adf4d6c8ee81dde4074c03ad0655d124712a7877e746e652db72005"],
	["d",              "D",                       "2eab6ca0537a8dd25a9edd2fd234159aca734b9f55aec9cbe07b8b832081634965ea1e1089cae2f9dbd9d976323427d860e5079c2e7e60c8480ff0e47b8bbf6c"],
	["dart",           "Dart",                    "97854fd57d59933b460cb560fa22535fca539ec62d0b1a5a249bca7bf2f12801173c78e86051ad4e066aea5f31c7c3c023ec59c0013c36beb9e41154221bcb75"],
	["delphi",         "Delphi",                  "1c1f9154bfffae49331a7340ee1df3b0a47a04a07ad9f1811cf33d15c8266b7ad6612206afaf86303533d1c1b9c1058fac43ed968e0ae4c7dce1bc69793f3e44"],
	["diff",           "Diff",                    "1d64fcfd0ebe7b7d70a2cfa21ebd5d111a1eaf2befcf5817f17ae49c069634070be134df8d32406d93fc6cb89b4be4d9169891431318143cb150b283de67f885"],
	["django",         "Django",                  "79bb6492fb4f1a01eb679be99a814e9c24fad67308cd5d6d8dcac2a25d2043531cfe3ea25ef459089cd6ee55d1d0659f85ae5ccd1e707dbfb0e562df7675979c"],
	["dns",            "DNS Zone File",           "6d281f01705e6596e37e0ff30ca9f8dbbfaaa50e851de46dddacfbd17bd55ecc4bd431db6b4638762cea1e6bedbf5e9de889e96af205737343406f534950f30d"],
	["dockerfile",     "Dockerfile",              "a3979eac7d2654219cc947b11b300e053a90197f1b2d3de70c8a892a2a129cc357ec2b3a530e1161f558a1031a6aeb45e3efae9e16eb029cdb01a753e3025217"],
	["dos",            "DOS",                     "73e355a047e83c81fe4b40bbc7c0b264ee5bda5d5606185b210e9d0dd96895f5e76db261f6a37beb30cf05db5f4e01851b9dcf3b52816a61ce4059e76bfef150"],
	["dsconfig",       "dsconfig",                "5e22c8433a890f525afcb057b0136456e17dff3f99917d6ad9b17c7737bc522c283d159680d8309d241bea95ad804fd77c01e9b52bd36f9614e9e9f00cf37a01"],
	["dts",            "DTS (Device Tree)",       "4901fed626019fef56950891652bce2c190c944447208ce1523d60633b1611c8c8991cc8763082c8cefa718722c09d617a47287f5cb9f25f15b1f021c74a568f"],
	["dust",           "Dust",                    "ce72975665d129749099a602ad5a0dce10f392797f620007067315a7269096bd8ed857e232afebdb21ae4339cded1fb0436706d359825634e95636baa5ff13a5"],
	["ebnf",           "EBNF",                    "cefa5fba38ccc8edea752a1f298901a9380110c57db654427ac513d801b7978cb55e76ac618230794cae7b87cd59dc3c8fe79432bbde96f4a70b64f9b77a5764"],
	["elixir",         "Elixir",                  "ecc82beb703ecd60b26c778c4d1dafc498b9d6f755bbaca3817543fb10bea062300b5a48a7c4490099d6d8736eea06d5a978e156d2da1aaca7debcedae9934cd"],
	["elm",            "Elm",                     "eb3138309f7a3b2efe3e82214de9f471ad8535d5d04f6a96c2ac1e9e79f7849cac37e48ceeaf1d20a4257b8c8fc51d1fdac17b13e75827872a09f1c96ac5525e"],
	["erb",            "Erb",                     "8a5296ee747b774891394a39ae695ec02fb62f95534fdf8a1ad1be4a4e46d8bb8228a7c7fd3ebf3334c46f0940fd94797413e51455bf1d5f41183e13d243101d"],
	["erlang-repl",    "Erlang REPL",             "c79157d549699572b067d26d93e35667733c09b0d3c237c471c377085d9a05294b3138465139515a6783a950ee939e210c0811d35490d88baff733c4f87be523"],
	["erlang",         "Erlang",                  "413b12647effdc8663f57f564fe577d6b76cde5ab67a7b219cf3d09ac9fd7179bdb149dcb7a0de31c62a3fd50ffdb23a49ef7a5684f8f8d2005e38614a8c121c"],
	["excel",          "Excel",                   "0fe9b38bf03da6b5c2d04948a35751458f0b20f088b9d8073d23ba86ebbc36ea6226ee7b02be65b7761888680309c39c5f19d6fe5247ae41cb6c3382c0665a61"],
	["fix",            "FIX",                     "8ddcf4665ed7da6bbf0cfc2b73bed2c0d782a3566ccc02b5d7ea1fa68d05385cf92a7570604d99625677675834f106f72b41f242330a6a07f6cc5f4936c9f3b0"],
	["flix",           "Flix",                    "9e49604dfad5bf5449d366c1fb9c0c4111244a36a0f8653ccea4a251c1ed2ee986e1dc78f27f8d2b83901759efcea0584e73e4e6c44d69324f573bdb6df6de91"],
	["fortran",        "Fortran",                 "e1bf52d721b15c2128ae08eaf972f82a0ce157fd2574c7ff49325f0e2165911d1d95e08b7252227fa239746c2b74a8f5dbb2b9b303802c6cbead43d0614aed6c"],
	["fsharp",         "F#",                      "7e5173f0e22a8b083586897a84847df3cb0fc0d83e8af8e47a0c66588fb26ca4aadd7931e360a16baad11e1d6a6961c395cdcb06d3368c71a9096baad6ebb39f"],
	["gams",           "Gams",                    "7bc96bef661d798556fce28ef73ee9d600fba22fc32b9f9c32ec842e2fc0922a1215923e769b3ecb97f7825b9dce08cc27f9a2e6bdab08a3650db5d5ee11ab0a"],
	["gauss",          "GAUSS",                   "4f9a3962ffdabdf8678899ed2b9eed77c4b909ea8d52a35488d5d60c906887fc11db25082df0e97749edcc00e8cbe3cf4679ca73441d23a43317cb6e1849b861"],
	["gcode",          "G-Code",                  "1b725f443cb8519d947b37e863540dfa319173df9ac643476ce68dec2028e4571d09a2aa013504d01ba0f2cb82ed17930d83a5929c6a6704f1cf75783092eb94"],
	["gherkin",        "Gherkin",                 "7f99bb3cd28cf9e65258e7dec066a6e26495894faeed335629964cfddb43296871283d15216f69e4d1dd6057102287434e555e4463ec7b98d2164cac6abe2e87"],
	["gml",            "Gml",                     "38240c972ecc6db8b9bf848308baac3f1ee22d8fffac67254bfd4a1d9682cbcadfb80950180f52f62a59bb9ee64a285677ef175bc38e970f219ae83a57b727fc"],
	["go",             "Go",                      "62fafb366fe24d490554a68ac755844708841781872abdee4137e76c9e06ede5242c70b3ce9246c2809943f6b93c0f40b739146fd41288b005234d1dce27a329"],
	["golo",           "Golo",                    "52c8e873b09e55de207df689ef2c3dec01308ac5ff880b7cfb587a300abe3cdf23486f8ec1b90a1054b5427788b8f9a11dbe2d7e72d1f0f95593d221de2dfe2e"],
	["gradle",         "Gradle",                  "be389e3d25a4caa29afe0c5863a761e6746d438d12b37ff466918303f451bb9253c3586019b555935a43104fd49342e680413eb77587200cca1da41a583bbec2"],
	["graphql",        "GraphQL",                 "057afa39725d8ce2b2dbd9a3f023234f4ccb3605653433a887c299c6f7221023767f6d70694fd0f4a65a052e7c6eb37521ab5b772cfb5092a5e54f467e0b7cba"],
	["groovy",         "Groovy",                  "438c93548b74c3306e6c82c370fc5adc60fbae7c173839b3de7f2a2605d9f86e907cb1e6da6e396271c1739a6881b3c91fe4437acd431b94367915c74bc910f5"],
	["haml",           "Haml",                    "7c59f708461e804db3cbb58a3750faf07ace0355c6dc60d21f74a9ee6f347e2de2196b6374689bbaaab8ddd356aec2fdcc7448e69f5e6f3e4e17b061df4c8a00"],
	["handlebars",     "Handlebars",              "78f25d2a3e1e0cbf64b83adc0d7089565345045b6a8d0476a497c7d4dffa1818080b61e7fdc47831fad3b19b9255b834bd40402bf31354917659e3ff36e913d2"],
	["haskell",        "Haskell",                 "2c22b75b9d6f8cb06889a5a216326ae230453ae46ac758ba87f4dae8fc73591c8b83efde08818316db84e210cf046ab7803bd6b3b7c953229f550d543133c1ae"],
	["haxe",           "Haxe",                    "76d82d20b5b80f2c5c9cf7a762214a269befb5c8a2bcc5429fb6f262c9398de09343de9a941929044a02a64a5d61ddf88ca0dbe9fc3f42e40440520c555c0922"],
	["hsp",            "Hsp",                     "93297b90993ee5b327a5b231137537026f87723a34a1f0fff24d5ef533447911c406d984decb241fac59ae71c2f44ac183b05d6cee8e3232c16b9efd158205e9"],
	["xml",            "HTML, XML",               "8d9be4503536eac3444c73931678d02e4b7b803c397184725c8e20d24e05222d86c16b849d4ec1bd0639493bbc560d8e6fdcf4c0b1a2f40e2889e24268506123"],
	["http",           "HTTP",                    "fec701e4bb6aedee95c97addcccada048888e9312c1b283b7911a0eff6b737e9b194741d59eca92430cd0027043f771ca9969efe221704678178871a2d0154c4"],
	["hy",             "Hy",                      "e388495cdefffb5c0ab817679f05030bc1f88bf240ee1c1789624bbd8e02fc602ebfd5ac92846f66e3f7a34ad0cf67b16440092823070c03511446790b396509"],
	["inform7",        "Inform7",                 "55023ac5125adfe85313bb1345c8417711b54afded78a582e0d51cc1ecce795d547a6aa2f4e344bbf5c0012bc8226aa7b11eb15bff4e6cdee27689edaba7bac2"],
	["ini",            "Ini, TOML",               "59cdc18d8f52aa684737891776598a52298512b3900e079002e971e8c64162d0362cd7bdc247a50f654361dde859541734bb44d9820ac950b1d7b7c60fad06a7"],
	["irpf90",         "IRPF90",                  "0769a9a34d33ee75dc45456e31105d4d565ef1b40ad3ec7196eb33cc73e79e63fd686b9a94b91302852a5dda73a4d3f67d6fb586f989bc8a5dd533f8cd5a375b"],
	["isbl",           "Isbl",                    "5d223845820b96f094855b3a8f9a85f0400aeb2b7b332241352d666703b801ef11d22a66a405e86b54cc80a8aeeb20ed8bba357ade4291597721b033324a56ea"],
	["java",           "Java",                    "acc5970fe68721a67f3563e2661ab5d95175e88784524d17148b1425e398979e7c20f3796bf31fea2ee4fdde224c5e8179a151e1b11b34f487f643a1ddd54402"],
	["javascript",     "JavaScript",              "d13c6bc9aaeffb3ba7dab2b43e9c440550322374c91dbc33bf6c6b5f0e8e722e5a0d9324e1e385adeaf29f2cbdf885b44ace181cb519ff3604bdd12229903188"],
	["jboss-cli",      "JBoss CLI",               "18fa016bbc97b3ac718a132548d1be2c9dc2073b462355d2c1cc4933592f8add691009f513e507c1678b441787ea9a5a127495849801856f08a495d3ba0aeaae"],
	["json",           "JSON",                    "87b72c3ae1d7113344397a1cd8bd4901f9e6be009252c3d8aa2545a8f1dac17b6a877e8541c1e05189c83a0ee97d3904f0dd2663dd5f4b2dcda9d44f0fa2a414"],
	["julia-repl",     "Julia REPL",              "9c86f02b11e66f6cbb800ba195573dec76cf822d87b9b83f2e07f5920cf430cc6b6fc4bc9bd2a2247abcabf438d6a0970b117660845b5773852142b2fa6f0398"],
	["julia",          "Julia",                   "f6dc490b86bc8a0bdf0c107f62ef64c981bc191b125e687f99e8b0607c2e0bdbef95d0cf8de024a6ff05ec7e86d244d6742523f4b52987fb4101d01b219aaffe"],
	["kotlin",         "Kotlin",                  "fad7b1ff40ab0db0dc3fd66e2626f834040528d7f9ec66dc528503f7ebe55aa7aa0287d3924456fe563914203e0e2fb48e12833628aec09078d75edd94b6daeb"],
	["lasso",          "Lasso",                   "9d08c03b6da7f3082e7933c4657eaf61297340f52b2d628663b91ebfc98bd6958994b9392eed27d404b84c66c38bf300f60ac8bbdea432909cb8f86a39b1b867"],
	["latex",          "LaTeX",                   "26af6469dfc0cd7cd901544558241c7ab489a2777a745e5f70fe3954aff6ecdd2406b5e70846b760bcfd450825a81f2ac6beb41b8351a3377468477cae9ec44b"],
	["ldif",           "LDIF",                    "7ccb9555f715edc6f22a9e0aee66f04da0658c37541a84efd78ba4799793d04157ca1e6669ad537fbe471a5397b5ec4b1cfad0a91bb58fb6d2000e27a4bf0a7d"],
	["leaf",           "Leaf",                    "e89f400a23a47559e77cfd849b417c027efd578c0bc4255f0a62506da918bcff7cf7ca9fdb80cb2b3af3eeab5fe0d0a4064e91b41c15a0228f98db458a6f670d"],
	["less",           "Less",                    "bb0473031e47c437284011a5caa2b56c506bc919149beb29d8efa2d19e941134f711424661991b311fa7317e1c03b3d804c43e70240e723d689d4dabcab111ef"],
	["lisp",           "Lisp",                    "5eae7678cfa9431249f08008617dc0c3899efff404154a586daff4643b64775a9afaf8e6cf9bb63ac9b6177a8ddccc35b35467798b57294eb6b1b64f9e8061f1"],
	["livecodeserver", "LiveCode Server",         "d16cd25a43904fb6ee48fa4a0f0afd5411974fa78767ce6f6c0328445acd80b2c694c58ce8ea110cbc9d8b6b60846a4bd967e71bf9f4f3ba7d70afcb430e1d13"],
	["livescript",     "LiveScript",              "58fe4931edc97bac9fb4976cd65f4208e8f31d8893a67cc021333ecaa8f03be51bb7f5da9bc34db2e2f72fcd70a9786afe34e607b98cd2cc5893a233bb54ab42"],
	["llvm",           "LLVM",                    "444a461a0765ec57d32ec4e93ca7fdeb4596f8f47da290bc68013a4c36229a24626584feb4e8a9de2ec79db79c2766d7dac6d3c5081727a25e7de7ff1197d0c3"],
	["lsl",            "Lsl",                     "100f2d1927375a86cef3d326500144a8ce9a59ae4baf101d34c2825fcf3900689a2b29661f64ad59ad216ad86feb0f4403e7b1c8b2e84727e971c5944935d8ad"],
	["lua",            "Lua",                     "afa8b0fb1745d3c915f278e27d55211f6fc178aa0a684e5043f757e7d8665e125d5c6c5a0c9919b0e0fc67e137c1f30a6214c3dca619d9e2cde61e40cfb4bc72"],
	["makefile",       "Makefile",                "5cf7b0fe8ddc84f4327edb6c60187e036163e7b7924a6a08641b97c938f51f7224895636087954629be1743e8540ec7ea21d3f56e0a15e65f1e09abcff82c7bc"],
	["markdown",       "Markdown",                "f1484952747861926527952e007bb0cabf1584ecdf2627760c9e966ba1b3ce70b0308693ff1a5bd2a9788813d13a7ee3b33d948c80430e3d4f117c58491a39a3"],
	["mathematica",    "Mathematica",             "badd6718717a7a04bc5a909f456c76993f34de342d0d2c8ed0115ef679e5cfb9853ec9d51b08b7f074fb8b1b19f499cfe6671b76300f8863f8f00445bbc4aee2"],
	["matlab",         "Matlab",                  "7fde5978c04fc1785828b66a2fed8cd4af1b3c6f55bc29e9c10d691fe29c5c7b40da1f875dab9c628224d74b7fffebdf69f794efd438ca98444c72701ef3bea4"],
	["maxima",         "Maxima",                  "4f736872f42108fba181aceb1485bd299f7832ab62143ad7c0da4a65115d3860eb08c9a5c54a689181c573f0d2e8ed2dcbabd5b2853c9a77de2c21e622a2996b"],
	["mel",            "Maya Embedded Language",  "7db059d949e8fc9a6e9e20acb7901ccbb0bc377f98bcd691d29fca03ddcfc78e5245e55afd05a3853990f20a4e452ac32762c5a6bc18025b964e0894a138a14d"],
	["mercury",        "Mercury",                 "6dd47747a59146636232f53953ad6a0d1dec4154e6af5e9f0d4a4a9667c87fbbea545fefe3204e2d910e0419de4f917f260159547adc10f1c14a2b7319d2e6d5"],
	["mipsasm",        "MIPS Assembler",          "feaf85313205160893c208f9daee9819f02ccb4c39f9b7680b3d6e9f8c38e9c395545bb1f2ed8c483cf83541656b3d1188ae30e23a72d4e9e1bab3002b21623d"],
	["mizar",          "Mizar",                   "d9d8ee61c12339a4f8255fc3434caca6d280f16966851d37b3f7a9cecac2caffbc2691181df03faca17665e3d08f9efebf9e6efd627afe0cb5becc9264953e51"],
	["mojolicious",    "Mojolicious",             "b40cd65bf6202a41957f97e8b0a1cd0b3a72851d08000394a8682b077272470fab2c42fedaed6eedbfb2fe160298b6ba047fb455bb30d9f9dfdecacde038167c"],
	["monkey",         "Monkey",                  "739f9431d596467ea0579ec32e57a7bea33012a47be78a7be81a9b2d6024e856b474b2a0d1eb8e7746d61754e322b4659fce7e342e0e0d7c4b5668d26efaf09c"],
	["moonscript",     "Moonscript",              "c5e9140d1eed159f8dc60e275027c1749fb278abed9b43ebf1bd717df766a9e9acc316599b187001449f257d74708f2ebb8a8fe1cf55a5f4c5da6298431ee606"],
	["n1ql",           "N1QL",                    "c90a1282b40be7b0bf3e9a2c1e6a32360595583d057725a7cdc9b1cb93d58632f02516f6cbda693884f9e69b8184063f477e73d5b370a8e1ad56e3d4119eece7"],
	["nestedtext",     "Nestedtext",              "699facda9279b713b4e33f2747167416df5679562fb33187dd03169299d2d0b3ca7280eb8619206c6c797b35723fc2199c3fea419858107ce8cd331f93dbc4d6"],
	["nginx",          "Nginx",                   "71ea7ac9d01c2ca110b9a261c4875aa03b390e32d534ff9bfec6cdb42fb6835be8146f352bfae5c6811c14940c945782be32b782462bbcf3524ea7e454a1d201"],
	["nim",            "Nim",                     "058e1aca85ccd7d949489f6cc6a700154b80018609befdd4a89c955ed9e703aeec890f8a259fd1a01d45f655ef9f296ab8f7d7a57eb9847ac3a83ce00794420c"],
	["nix",            "Nix",                     "d3594cd85642343fd5ad4fa2c4ac91d22bac0d8d47f532b4bb70626c5f2923d0e0330a401ea8c18dc76f6535df56a345ae26675faf49a5eb7a268e644304ff0b"],
	["node-repl",      "Node REPL",               "71c33168623894bfb3c039902d9af43658b8236d721294d139dc2ea6be306229cda00b797bd3273c4e56e4a6777182f5e31e222cc84c35ac89efd11a0dd4f090"],
	["nsis",           "NSIS",                    "b67aaceeb561af46f246ada3b6a3202035d601a9c948261ae5a05cafda40bd1edc0c0ddde5e232d7aa333361f7c5d5a17deadf488c4f11b341747eea889560ca"],
	["objectivec",     "Objective C",             "16c6aa63030b68f6302a45a890d224e4f932d9e8b3641d9218f72f69ac77f4493ba2a599ffb07243e51e7133492d6b60314f66c4be09e03444195e70405b0531"],
	["glsl",           "OpenGL Shading Language", "1e6e61078724dd2722f68984a79a9b96332d2f9f5cda78b9b11e5ef1937984a733ab38fcb07db6c21fae4e3dfe78258f0c27ae53fd44bbdb547111bb94d4dbf1"],
	["ocaml",          "OCaml",                   "0e2992563903db9f8c62764f1a8686030e112bd171b6afc46dc04d05e15c2c58eb0370488b31badac1a52d54896b80ec963abc737402764dae0ea1475332b58e"],
	["openscad",       "OpenSCAD",                "485bb362a4355fdc3ec14460282fe38d3f739ad2a489b53d752eb428dbe0ac795528810684fb02f601d5d15124fcf3580e094e00d7255321274553146198dda9"],
	["ruleslanguage",  "Oracle Rules Language",   "f74a97fbf1e42474a9b75919b5d19fbb42657f1230398a1b8a716f17dffb65a4fbffc1d25e411d7b3ffc702e13a03af1ea3f3cc95b0e06b1412e071e5d8da533"],
	["oxygene",        "Oxygene",                 "0a5026aaaba91d61d6f379496fb88d20593bc501603389751d9473be488226437d8b9dea2fc65b27b054f86cd79b7c189bc5e1a5dc4f3b279b6b212ca8b74230"],
	["parser3",        "Parser3",                 "c0fda0da06217d618a87a025493fb9a00ab3ca22a8d4503b704fc22a2dd89af1437e06d9e042db6c3902cac03ef2a19d9ba7a5716203bc1e994ecbc81b880f47"],
	["perl",           "Perl",                    "727a5f35722cf13c9b8f9dae57764fd2a858b7b704b8c6bc1e5955cbf964d1155cb69277871166e447e6828376e6dcae0a7ad1154243a277747dbc471902d32b"],
	["pf",             "PF",                      "2577f1e6c6d78ce0f5569b66cc7870b3746e61aedac7b5a86d0e263e26715d062b5047644f961d5a79c17d7e31b8b084407aad651ece2969d8506562cb1d5c17"],
	["pgsql",          "PostgreSQL",              "660ba05baacd4a3051ce8dba67e89327b31618ffbfc35261b10e3e0e32f39b8360b0cdd06faa16ecf483e9dbaad1ca415f1c034835992e8b00fcc581d0aa60a0"],
	["php-template",   "PHP Template",            "2e35e972fb7dfa9fcaf4b9bbff0115980d5d9d73915ed6230b9c52412a754ef6ae47c989d98418134bb21a25fcf526850bebfd4c300ad11436a0ed2f9415309b"],
	["php",            "PHP",                     "71999fe4d831dc12efdafbdd5128911878c9a7a9620386e1110a7e1e5cdc07eb1772fc31dcd1a797cf9276e31a29ecd21e87cd81f713708418f93c12d32a28af"],
	["plaintext",      "Plaintext",               "2fe53dc642d1bb3f77c137704ac4ca7e0c5e8d6780e41fbbeff2f3b6f5f81ef9072c264ff896d90f697d78a60554241b3961c21c2986ce371e2591f0d691a8ba"],
	["pony",           "Pony",                    "08e6c91635f8b9537a5ac496bdc23dcf1a7b182348bbf34f6f33f2894a7bb0756bdecf06a8b06023730a9817fdc8327a7ad7ad696d640444db84bf3732267346"],
	["powershell",     "PowerShell",              "1fdffc2de1ca548654cabc03dc64374f376d44aff536cb2e6f41c57ac3ac61423c112c6ef1f967c49deb9d416633150d3686d9b82f5e46aef95fd7b5c62465f4"],
	["processing",     "Processing",              "e1a8a48cf7cb9b5b6fda3d40de4834b80ce8485c4b5bcef513b8c60b0118eca6da840c899bcb0cf08e8bb556717cdd335d243e0fc3c4396f712be7ec228f84ab"],
	["profile",        "Python Profiler Results", "07a343973fe70017ecc826f056890f5117e6ff77aad5cef85d55f07acd3aba069d01d728b010a45e3b1555b43a19fa78b622c521f22acb2f3d1b70b98f4808d3"],
	["prolog",         "Prolog",                  "1e44559a4a7ea261a9e589af8aba8e41ca131b3d01e9591e4f8a4e776952673cc2db9c168c701a9d07cd4cac774f9eef22acc023e93ca16841d44e6aa4672765"],
	["properties",     "Properties",              "d43eb951dade861f1b5e01dfb20b49548ea563c26802f80a6d73ed07eabbb7756b4c2c3ad311ace5b7d6beb45410be83ed551f6a2c918883952a43b3b5d0b1aa"],
	["protobuf",       "Protocol Buffers",        "45e090b373ef9fd042c56c7308dda550b7b28272b9a51467957184bd6cc61ab1f01d47676fff0bcc34037f9577b43abc4a4ba98eeeb370651a0155eeeb82c41e"],
	["puppet",         "Puppet",                  "f093f1dc2e32c175f62a8ff0a78a44d182ec9dc4a189603bcb7853449b0e6c8051c536fbbd0d4d17df134227c3f178da31faa115da5c1c4fefa63f6619873bdb"],
	["purebasic",      "Purebasic",               "7504829567628fa78061595203d9104490ca9329511f3f269d73d10d383f95d2ae9ad8a081308dbec98d7722c57614f5a5c5cfbc8347e08fe72758d8989036d8"],
	["python-repl",    "Python REPL",             "56f0d6fbf1744d08b5ec14b443ed7124192640e9a59fb0d89b76704cf5681fc54df8b87ef8f6c0b52c6aa69853c75940d00e95495af0244a958da75938eaad4e"],
	["python",         "Python",                  "69a26e13456162ff5885dd436af67545c62ac7823f435113ec12983d141e4eb66febe2a6a5cc5db347ec916b37d6ba450eddc8f876919b8c3040cc58f17faa1c"],
	["q",              "Q",                       "029b438b03c5b95e9d00598480e5164f6ecb89d7b78850ab061fdcc1eb3624579a8ed6f3eebf77007bd90144f4246e7b19fa48ecce0c85cb090e9b201098e85b"],
	["qml",            "QML",                     "f3e3eef626a53e858be628064af77c8ba4dc14edddf94043a0f72997fa5400daf9a334b4772cf3b3746ebb197943ef3c578e65534422f20bceddf04a569c42e8"],
	["r",              "R",                       "a964d565aba02ac6a541d85bfcb0b2c7e126e750ac7b8ed6bd94d7f2df385de3ce7372bd7e37cee65769127fa61c9565c4173587b47ce8a4f11a76bbba925f00"],
	["reasonml",       "ReasonML",                "e970ddeacc8fe6ff4c14d4cec9bbb7f54dcc4c26d37bdf7f8c5ab3a838f068b5287d65bfaff4de1962b832da04cfffa185c934e8384efbc755f8b4d9303874d4"],
	["rib",            "Renderman RIB",           "42d172c54a6b9db51f76a4a84df7f0acc903a3f4e7b5b728ebeb8a115435ba42fc09ada8cee65fe7bc6bea49a140319ee0d70ce17a729b535a85aadecab0496a"],
	["roboconf",       "Roboconf",                "18ec642f4428f8004bb16cdfb38c5648aaa83919ee9a38d7fa22f3d431f09d7efb11ba84e5d24de680264b0a3b707c07eceefabf38f52e0d6725c12535e134f3"],
	["routeros",       "Routeros",                "ca58c744f3cf73f0917632b2deaceed49e1d90bc9bf02265f561aaf026089aee4c1f45d37353f3c5271f65691e8351d3937b32505abd00140c6f27a20892b5e4"],
	["rsl",            "Renderman RSL",           "e332479ec3bcba5547b866a97bfa855418c94148203ce5fbedd3bc5487e94a1bb23ca56e6f66440a512609dc696fecc9ef0854bf5ba5a540248b7ef58811212c"],
	["ruby",           "Ruby",                    "e70d4f7d2e76b3aece7e82ba5378641ea28bc636eff6be6a93a4b5201b99d1d714cb14f82fc2a16f8c6f3314a2c97d11e60f70bd7ddfc0df3ca1e00c4f28f43a"],
	["rust",           "Rust",                    "789c5882fa2465688c1833b03a8365e410518793e8eca7f36529a275d05ce2148bb0ef29891b32a15d636c91670b74c80b097689b44d54d7eb848144e559da51"],
	["sas",            "SAS",                     "2de2d614c22c3ad2a281cce300ae3644550611874e0865b053fc04b34887b8bd72a986bc3c6a8de12dc9cecb64c81de1ee78cff233712025fd7be50ba2a360eb"],
	["scala",          "Scala",                   "5da9e60441bfa1848eba3e3f8813732961945a43c0d30a669d40467c2e6599244d72eb894c8b51ea32affdd7f283d343b01bf9fde3582aeee895efd24396328e"],
	["scheme",         "Scheme",                  "a7750df689609fcccb425c0b7325db64255df5fe43c3a60e68cc8138e27094dfeaaedbc483dbcff8c92d0786f62223219b836066852b35e76e2ae8fa57cf0ff8"],
	["scilab",         "Scilab",                  "d1c1cd1cd1dd2e4f498ee17126c8fd0c822012dec5ba0bf0dfc894588e36cb778b1b52e978584b6ad119c34a71b2240f671d53e914339be7406715f4084c63a2"],
	["scss",           "SCSS",                    "66f132882fad637f50ac86c82a2c805425efae1a48f6e4bc68b6a36401bf4ada15696e7a588b85bbc0452f28de8f61e1384f5732f8d538773a429d9b8399f26c"],
	["shell",          "Shell",                   "05927094c92f48e6c36aed9e416f985effb15bc61bf8c717e76cbb8c7eaa550c963b03bf7fe27877ff4794cb63baee8ae4c0643f806ddb399ea8424265a6d086"],
	["smali",          "Smali",                   "e50a9b7c038b10636142bb4d27c45c4957926ff8eda7fd72ff86302509f3a97919c0ad3c985a3b754e8ffbf71b1b954b26b26be3e3d706c5ec64d36aa4bdd2d3"],
	["smalltalk",      "Smalltalk",               "7ec85ad45c4a1e1a3712c3863a25019d61d0af9bcfdd8093b748206c4a4a47d7b880b8d125d4066478e387eed284cf3a3cdcc58a8617b76041197d6019fb1792"],
	["sml",            "SML",                     "ae311aa9708b52b007205803132f3f6abb5676fdb008c3a22919d61450edd2123c4afcb0189578c2a19d289d269b1e7b91a4fcb55df8904acdc5c78a858200b7"],
	["sqf",            "Sqf",                     "d3bdd3bb05d9fa9f53bd2daec68260514acaf33398c47ec7ba6dbeb91729f89bedadcba5ac4e76f6bd1ee3caaba0646d6be5122c98d22a871b6f24e9a3a8d645"],
	["sql",            "SQL",                     "b78e6ce2b1785acfdf14d91990665ac7474740ca4a926b537d252685e7532a5e8a6f24e5ef96d6d9e858577616833b65d50e50d36176ee1eaf85c020dd8b4dee"],
	["stan",           "Stan",                    "1aea0f2e5b3ced7852d4d32e46f61e4e8d8414f9c2ddb9a7bd7978779809381a7cf10f859c071db9dd732a29c71ca955b943109c58d7f6bebc8495b086730aff"],
	["stata",          "Stata",                   "417f4e83449f9c9b1046d9773ba29cb50cc77202eec776f26c5f36340f0b858fd4886bd42b46388a495280e55998405d57fd0e2d923abedf8c0b189a2d8dd3a2"],
	["step21",         "STEP Part 21",            "6a145ae3f468591f79b3b386c72a4742729b1294d23a236ef8df1edaf907ade53d37ecaeae68d1ac6ef7bfa36de5b28db6e1ee17cfeb6b891a38189e0e13bde3"],
	["stylus",         "Stylus",                  "5a20073032933db44a4da9680d1a7e75898df4d7e4b41dd891097027db4fb0798f10bf1b656199537b3388a60046a588c6f7b85fb8131c422209596fa5b510d4"],
	["subunit",        "SubUnit",                 "4eec9fcf11aa141debbebda25997300d18f87408d8ab4d1ba7e7cbe69d0f03589ec47ca06571f135c76855d3bac5e03bd205192f357ee17e3a26e46c259ae4e7"],
	["swift",          "Swift",                   "9715a878f2955ff3bf3f58df59617432b5798c354bf2eea8661e5a59cb75f0bbb9b84c12fa83a530363ba5fd5ea629da5d484b14cb500f310b14004b3ff652a5"],
	["taggerscript",   "Taggerscript",            "edeebdf3cb10c249e5c46f080b28c654f68120a1008ef06d38b646aea9b0302b0c619a3466359cc7df2f1b54569f06d9bb4cc96aca8ed89fd7034a26040cb5eb"],
	["tap",            "Test Anything Protocol",  "48b38f42748457f0ff79dc754788039e3f38a5a8e72d9a57badd787c40650ab3757b1763bfc4aff094a505bede2ad0cc534f08f0343ce70a1653562513b96ff6"],
	["tcl",            "Tcl",                     "495c8c1c6f45562ec1881e480273324be55d65b6ec34587cbafb78720f2778b9b0bc07022a8626f2eebd2c8d320caa6e94b7ebd18084f08277201a1b8ce73c0c"],
	["thrift",         "Thrift",                  "9af077adad3a05c0b7eb8a70925a7ccc48f8c66f1df1c72f08668c00db2a2648bf95cb7ea1914311ed632c53776758d2689ad96aa175c2d39d9f51f2a32d9075"],
	["tp",             "TP",                      "49f20d3dbe83f6a0641df822e79b0a2fc6e3326a9a354685ac115a07d8752d31bca505607bc8da0e5fe753ab4675f086e3c2033aee627c7080e110f437d8878c"],
	["twig",           "Twig",                    "a4cc4bef1959254ef3ff61ee770f0cf2898c6dbbc1333c3872ad6c641767f16345fb54e7e3495a0e911a4b3f92ae7d3325dd09fe1d030a67029b14911d93269b"],
	["typescript",     "TypeScript",              "360bb8623b57dc33b346e6ad2204492da004a039e0a3e20e5560bbab8133c4f9641be8ca164cef7c6628c80d6b7e867b5766933f41fee587c28212a41e3cf76d"],
	["vala",           "Vala",                    "2676fdb1d5cb687bbc11f838d4e8c7c6932fd85b079e3ae29838aa6936da6092cfff8611249b6d533a8db36a542ddba995076e2c8aa1b8e8bc7edd6c50d2ad2f"],
	["vbnet",          "VB.NET",                  "4936ee28934eb0a518cc48701a5b81ea4416486faefc427fae5dfd928dea509cf3ffaf9aa8afdc9e2414653127e2e1ffeda8dc0b0571221df0f282f5aa7a49f6"],
	["vbscript-html",  "VBScript HTML",           "6f585de56df36f2c331c5839b51b881f6ef849d8533c348ea4f689adf87ee93ba531e6cf60bed1a7a050b6565f24d53cc625ec59e0aa4760044943442ccffd39"],
	["vbscript",       "VBScript",                "3ea18f99828d7d2b0b23efde227d82725668ea5e97780b4498b4bbf1c5ddf38339bfb0ea4b610fe30d7bb3a8e9373799d7d027cc670c0e328e0bb92cc2277902"],
	["verilog",        "Verilog",                 "efdd719bbd90790a996a1b3eccf405460813ca5f5af6e2a2dbe3f9612fdfddbe5c419881e3301cbf4722567bbecd33ada0d252c229a9d348e6330765cb088eea"],
	["vhdl",           "VHDL",                    "229c104017020e683398241a0930e58491c575f6b51788d75e73347be446a23596290d92e7ab473a85882fd9bb7f45e5a56a32a73dfada360026e00c3c373f95"],
	["vim",            "Vim Script",              "88e599a6729c2e7c8c68425410f6b555cabe29fac9bb0884ebd06767699c709624dea60c07a05930a011324fb8533056c19c296abf3bbf9a7d303e5bf47d63f1"],
	["wasm",           "Web Assembly",            "59e62979726be1e8fb5324fed4c61fb12edd2e47fef6a485a6ed306c14964cbdfa60ec7bdc99011debf853c851e7eb255b1f8d35af9c5e246fc0ea18aef03ded"],
	["wren",           "Wren",                    "ca27271df102a383ef5ad04566b572c03f69a4a451a4a169d29fc5a6c97f6990f2750e50995e0be18933ac246750ecbed04f937e4806dc4eb563fb11f1d70b5f"],
	["axapta",         "X++",                     "a1d6ba312037bf59992f97f6cca7c1b142b210ab195077e24e87bce9242eeed5fb40a5f0cc07a41072f633de5cb10d5264030fb0d487ac8b0d7ad3e36cc55a53"],
	["x86asm",         "X86 Assembly",            "60faae2eb89c74d53601446ba8c5cbc85cdf34799bdf68e27bdfafb67078e117ae2256f6acde20a701aa1f84b7237aade742409aaf665f83836004b51405b54a"],
	["xl",             "XL",                      "c9139649fbc0bacff64f890dfd737d0f681b691e27a0a3a50e0ceb79146d4e11dce89eabbfc63fa798c7434e518a5cb403667db357ac99dc9ced5c985db2b540"],
	["xquery",         "XQuery",                  "90caabd157155f071b9d7e8881a8835b6ee19f20acf197c196111aaf5391ed7ebafe1a10b188078796cc668e8a8c9a1fb5c0848dc1c88cdd9d57e34ef033d4f7"],
	["yaml",           "YAML",                    "71f9acefdde2fdb8a017e02728e70cfb5de9a888d4060aa9ced816347398571ce32440336a18c829db271191bfbcdc54b5f6e51cd2e88317010fb4f5543a2987"],
	["zephir",         "Zephir",                  "313b3f5bd94b11b8e991cb14ab17226bed0c2eaac1d049eefb648fc6677d3d380c32ec0c51b263ea1f7cde23070680afe8798533c49f2dc6cfcf217e51eb42fe"],
];

export function getCachePath(ext: Extension | ExtensionPreferences): Gio.File {
	return Gio.file_new_build_filenamev([GLib.get_user_cache_dir(), ext.uuid]);
}

export function getDataPath(ext: Extension | ExtensionPreferences): Gio.File {
	return Gio.file_new_build_filenamev([GLib.get_user_data_dir(), ext.uuid]);
}

export function getImagesPath(ext: Extension | ExtensionPreferences): Gio.File {
	return getDataPath(ext).get_child('images');
}

export function getConfigPath(ext: Extension | ExtensionPreferences): Gio.File {
	return Gio.file_new_build_filenamev([GLib.get_user_config_dir(), ext.uuid]);
}

export function getActionsConfigPath(ext: Extension | ExtensionPreferences): Gio.File {
	return getConfigPath(ext).get_child('actions.json');
}

export function getHljsPath(ext: Extension | ExtensionPreferences): Gio.File {
	return getDataPath(ext).get_child('highlight.min.js');
}

export function getHljsLanguages(ext: Extension | ExtensionPreferences): [string, string, string, Gio.File][] {
	const path = getDataPath(ext).get_child('languages');
	return HljsLanguages.map(([language, name, hash]) => [language, name, hash, path.get_child(`${language}.min.js`)]);
}

export function getHljsLanguageUrls(language: string): string[] {
	return HljsCdns.map((cdn) => `${cdn}/languages/${language}.min.js`);
}
