/*
# Test Set
- Text
    - Short text
    - Long text
	- Text too long for QR Code
- Code
    - Code snippet
	- Long single line code snippet
- Image
    - Image
    - Image that doesn't exist
- File
    - Text file
    - Image file
    - Audio/Video file
	- Directory
    - Non-existent file
- Files
    - Multiple files
	- 2 files
- Link
    - Link with preview image
    - Link to image
	- Link with title only
    - Link without meta tags
- Character
    - Emoji
	- ZWJ Emoji
- Color
    - Named color
    - Hex color
    - Rgb color
    - Hsl color
    - Hwb color
	- Lab color
	- Lch color
	- Oklab color
	- Oklch color
- Tags
	- Every tag color
*/

-- Create table
DROP TABLE IF EXISTS 'clipboard';
CREATE TABLE 'clipboard' (
	'id'       integer   NOT NULL UNIQUE PRIMARY KEY AUTOINCREMENT,
	'type'     text      NOT NULL,
	'content'  text      NOT NULL,
	'pinned'   boolean   NOT NULL,
	'tag'      text,
	'datetime' timestamp NOT NULL,
	'metadata' text,
	'title'    text,
	UNIQUE ('type', 'content')
);

-- Set schema version
PRAGMA user_version = 2;

-- Add trigger to randomize timestamps while keeping the ordering
CREATE TRIGGER decrease_time
	BEFORE INSERT ON 'clipboard'
BEGIN
	UPDATE 'clipboard' SET `datetime` = datetime(`datetime`, (SELECT (concat(-10 + random() % 5, ' minutes'))));
END;

-- Insert entries
/*WITH RECURSIVE cnt(x) AS (
	SELECT 1 UNION ALL SELECT x+1 FROM cnt WHERE x < 100
)
INSERT INTO 'clipboard' ('type', 'content', 'pinned', datetime)
SELECT 'Text', 'test ' || x, 0, current_timestamp FROM cnt;*/

INSERT INTO 'clipboard' ('type', 'content', 'pinned', 'tag', 'datetime') VALUES
-- Tags
	('Text', 'Slate Tag', 1, 'slate', current_timestamp),
	('Text', 'Purple Tag', 1, 'purple', current_timestamp),
	('Text', 'Pink Tag', 1, 'pink', current_timestamp),
	('Text', 'Red Tag', 1, 'red', current_timestamp),
	('Text', 'Orange Tag', 1, 'orange', current_timestamp),
	('Text', 'Yellow Tag', 1, 'yellow', current_timestamp),
	('Text', 'Green Tag', 1, 'green', current_timestamp),
	('Text', 'Teal Tag', 1, 'teal', current_timestamp),
	('Text', 'Blue Tag', 1, 'blue', current_timestamp),

-- Color
	('Color', 'oklch(0.55 0.2039 315.86)', 0, 'purple', current_timestamp),
	('Color', 'oklab(65.1% 39% -5.25%)', 0, 'pink', current_timestamp),
	('Color', 'lch(50.8% 77.31 26.9)', 0, 'red', current_timestamp),
	('Color', 'lab(57.55% 53.47 67.2)', 0, 'orange', current_timestamp),
	('Color', 'hwb(41 0% 22%)', 0, 'yellow', current_timestamp),
	('Color', 'hsl(131 44% 40%)', 0, 'green', current_timestamp),
	('Color', 'rgb(33 144 164)', 0, 'teal', current_timestamp),
	('Color', '#3584e4', 0, 'blue', current_timestamp);

INSERT INTO 'clipboard' ('type', 'content', 'pinned', 'datetime') VALUES
	('Color', 'rebeccapurple', 0, current_timestamp);

-- Title test cases
INSERT INTO 'clipboard' ('type', 'content', 'pinned', 'datetime', 'title') VALUES
	('Text', 'Item with short title', 0, current_timestamp, 'Short'),
	('Text', 'Item with a long title that should be truncated with ellipsis when it exceeds the available width', 0, current_timestamp, 'This is a very long custom title that should test the ellipsis truncation behavior');

-- Character
	('Character', '🫃', 0, current_timestamp),
	('Character', '👨‍👨‍👶‍👧', 0, current_timestamp),

-- Link
	('Link', 'https://www.github.com/robots.txt', 0, current_timestamp),
	('Link', 'https://example.org/', 0, current_timestamp),
	('Link', 'https://github.com/fluidicon.png', 0, current_timestamp),
	('Link', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 0, current_timestamp),

-- Files
	('Files', 'file://{DIST_PATH}/database
file://{DIST_PATH}/icons
file://{DIST_PATH}/lib
file://{DIST_PATH}/po
file://{DIST_PATH}/schemas
file://{DIST_PATH}/extension.js
file://{DIST_PATH}/metadata.json
file://{DIST_PATH}/prefs.js
file://{DIST_PATH}/resources.gresource
file://{DIST_PATH}/stylesheet-dark.css
file://{DIST_PATH}/stylesheet-light.css', 0, current_timestamp),
	('Files', 'file://{DIST_PATH}/extension.js
file://{DIST_PATH}/metadata.json', 0, current_timestamp),

-- File
	('File', 'file://{DIST_PATH}/database/non-existent.png', 0, current_timestamp),
	('File', 'file://{DIST_PATH}', 0, current_timestamp),
	('File', 'file://{DIST_PATH}/database/audio.mp3', 0, current_timestamp),
	('File', 'file://{DIST_PATH}/database/image.svg', 0, current_timestamp),
	('File', 'file://{DIST_PATH}/metadata.json', 0, current_timestamp),

-- Image
	('Image', 'file://{DIST_PATH}/database/non-existent.png', 0, current_timestamp),
	('Image', 'file://{DIST_PATH}/database/image.svg', 0, current_timestamp),

-- Code
	('Code', 'chr(round(ord(min(str(type(tuple))))*len(str(not()))*((ord(min(str(not())))+len(str(filter)))*sum(range(len(str(not(not())))))+sum(range(len(str(not(not())))))/(ord(min(str(not())))+len(str(filter))))))', 0, current_timestamp),
	('Code', '#[derive(Debug)]
pub enum State {
	Start,
	Transient,
	Closed,
}
impl From<&''a str> for State {
	fn from(s: &''a str) -> Self {
		match s {
			"start" => State::Start,
			"closed" => State::Closed,
			_ => unreachable!(),
		}

		if (str == "trans") {
			State::Transient;
		}
		else if str == "start" {', 0, current_timestamp),

-- Text
    ('Text', printf('%.*c', 5000, 'A'), 0, current_timestamp),
	('Text', 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nullam nec viverra dui, et cursus lectus. Etiam vel placerat tortor, ut congue risus. Pellentesque convallis semper pulvinar. Nunc accumsan magna in nulla viverra sollicitudin. Suspendisse potenti. Sed volutpat dolor imperdiet semper interdum. Vivamus imperdiet risus a tortor laoreet, sit amet venenatis erat faucibus. Nam commodo dui eu posuere mattis. Lorem ipsum dolor sit amet, consectetur adipiscing elit.', 0, current_timestamp),
	('Text', 'Lorem ipsum dolor sit amet.', 0, current_timestamp);

-- Remove trigger
DROP TRIGGER decrease_time;
