#!@GJS@ -m
// Gst.init may deadlock if run in the compositor.
import Gst from 'gi://Gst';
import GstPbUtils from 'gi://GstPbutils';

Gst.init(ARGV);

const discoverer = GstPbUtils.Discoverer.new(3 * (Gst.SECOND as number));

export interface ProbeResult {
	uri: string;
	success: boolean;
	duration?: number;
	error?: string;
}

function probe(uri: string): ProbeResult {
	try {
		const info = discoverer.discover_uri(uri);
		const success = info?.get_result() === GstPbUtils.DiscovererResult.OK;
		if (!success) return { uri, success };

		const duration = Number(info.get_duration()) / (Gst.SECOND as number);
		return { uri, success, duration };
	} catch (e) {
		return { uri, success: false, error: String(e) };
	}
}

const results = ARGV.map((uri) => probe(uri));
print(JSON.stringify(results));
