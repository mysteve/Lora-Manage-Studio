import importlib.util
import pathlib
import unittest
import urllib.error
import urllib.request
from unittest.mock import MagicMock, patch

spec = importlib.util.spec_from_file_location('vocabulary', pathlib.Path(__file__).with_name('update-prompt-vocabulary.py'))
vocabulary = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vocabulary)


class DownloadTests(unittest.TestCase):
    def test_sources_and_licenses_use_exact_allowlist(self):
        opener = MagicMock()
        opener.open.return_value.__enter__.return_value.read.return_value = b'csv'
        with patch.object(vocabulary.urllib.request, 'build_opener', return_value=opener):
            for pair, expected in vocabulary.ALLOWED_DOWNLOADS.items():
                self.assertEqual(vocabulary.download(*pair), (expected, b'csv'))
                opener.open.assert_called_with(expected, timeout=60)
        for _, repo, path in vocabulary.SOURCES:
            self.assertIn((repo, path), vocabulary.ALLOWED_DOWNLOADS)

    def test_rejects_untrusted_source_before_network_access(self):
        repo = 'DominikDoom/a1111-sd-webui-tagcomplete'
        with patch.object(vocabulary.urllib.request, 'build_opener') as build:
            for pair in [('http://127.0.0.1', 'secret'), (repo, '../LICENSE'),
                         (repo, 'tags/danbooru.csv?url=http://localhost'),
                         (repo, '//169.254.169.254/latest/meta-data')]:
                with self.subTest(pair=pair), self.assertRaises(ValueError):
                    vocabulary.download(*pair)
            build.assert_not_called()

    def test_redirects_are_rejected_for_all_destinations(self):
        handler = vocabulary.NoRedirect()
        req = urllib.request.Request(next(iter(vocabulary.ALLOWED_DOWNLOADS.values())))
        for code in [301, 302, 303, 307, 308]:
            for destination in ['http://127.0.0.1/secret', 'http://169.254.169.254/',
                                'https://example.com/', req.full_url]:
                with self.subTest(code=code, destination=destination), self.assertRaises(urllib.error.HTTPError):
                    handler.redirect_request(req, None, code, 'redirect', {}, destination)
        opener = urllib.request.build_opener(handler)
        self.assertEqual([h for h in opener.handlers if isinstance(h, urllib.request.HTTPRedirectHandler)], [handler])

    def test_limits_response_size_and_closes_response(self):
        opener = MagicMock()
        context = opener.open.return_value
        context.__enter__.return_value.read.return_value = b'12345'
        with patch.object(vocabulary, 'MAX_DOWNLOAD_BYTES', 4), patch.object(
            vocabulary.urllib.request, 'build_opener', return_value=opener
        ):
            with self.assertRaises(ValueError):
                vocabulary.download(*next(iter(vocabulary.ALLOWED_DOWNLOADS)))
        context.__enter__.return_value.read.assert_called_once_with(5)
        context.__exit__.assert_called_once()


if __name__ == '__main__':
    unittest.main()
