"""
API Vercel pour générer un package Excel BC à partir des données de factures.
Endpoint: POST /api/generate-excel
"""

from http.server import BaseHTTPRequestHandler
import json
import zipfile
import os
import re
import base64
from io import BytesIO
from urllib.request import urlopen


class BCPackageGenerator:
    """Génère un package BC Excel à partir d'un template."""
    
    # URL du template BC - par défaut utilise le template dans public/
    TEMPLATE_URL = os.environ.get('BC_TEMPLATE_URL', '/bc_template.xlsx')
    
    def __init__(self, template_base64=None):
        """
        Initialise le générateur.
        
        Args:
            template_base64: Template BC en base64 (optionnel, sinon téléchargé)
        """
        self.work_dir = '/tmp/bc_package_work'
        os.makedirs(self.work_dir, exist_ok=True)
        
        self.extract_dir = f'{self.work_dir}/extracted_{id(self)}'
        if os.path.exists(self.extract_dir):
            import shutil
            shutil.rmtree(self.extract_dir)
        
        # Charger le template
        if template_base64:
            template_bytes = base64.b64decode(template_base64)
        elif self.TEMPLATE_URL:
            with urlopen(self.TEMPLATE_URL) as response:
                template_bytes = response.read()
        else:
            raise ValueError("No template provided")
        
        # Extraire le template
        template_io = BytesIO(template_bytes)
        with zipfile.ZipFile(template_io, 'r') as z:
            z.extractall(self.extract_dir)
    
    def _build_cell(self, col, row, value):
        """Construit une cellule XML au format BC."""
        cell_ref = f"{col}{row}"
        escaped = str(value).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
        return f'<x:c r="{cell_ref}" s="1" t="inlineStr"><x:is><x:t xml:space="preserve">{escaped}</x:t></x:is></x:c>'
    
    def _get_col_letter(self, idx):
        """Convertit un index en lettre de colonne."""
        if idx < 26:
            return chr(65 + idx)
        else:
            return chr(64 + idx // 26) + chr(65 + idx % 26)
    
    def _build_row(self, row_num, values):
        """Construit une ligne XML au format BC."""
        cells = []
        for idx, value in enumerate(values):
            col = self._get_col_letter(idx)
            cells.append(self._build_cell(col, row_num, value if value is not None else ''))
        return f'<x:row r="{row_num}">{" ".join(cells)}</x:row>'
    
    def modify_header_sheet(self, invoices):
        """Modifie la feuille En-tête achat."""
        sheet_path = os.path.join(self.extract_dir, 'xl/worksheets/sheet1.xml')
        
        with open(sheet_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        match_before = re.search(r'^(.*?<x:row r="3">.*?</x:row>)', content, re.DOTALL)
        match_after = re.search(r'(</x:sheetData>.*?)$', content, re.DOTALL)
        
        if not match_before or not match_after:
            raise ValueError("Invalid template structure")
        
        before_data = match_before.group(1)
        after_data = match_after.group(1)
        
        new_rows = []
        for idx, inv in enumerate(invoices):
            row_num = 4 + idx
            values = [
                'Facture',
                inv.get('documentNo', ''),
                inv.get('vendorNo', ''),
                inv.get('vendorNo', ''),
                inv.get('vendorName', ''),
                '',  # Nom 2
                '',  # Adresse
                '',  # Ville
                inv.get('postingDate', ''),
                inv.get('postingDate', ''),
                inv.get('postingDate', ''),
                inv.get('description', ''),
                inv.get('dueDate', ''),
                inv.get('dimension1', ''),
                inv.get('dimension2', ''),
                'TIERS',
                '0',
                'true',
                inv.get('vendorNo', ''),
                'DIRECT',
                inv.get('vendorInvoiceNo', ''),
                'NATIONAL',
                'CH',
                inv.get('vendorName', ''),
                '',
                '',
                '',
                '',
                'CH',
                '',
                '',
                'CH',
                'Compte général',
                'false',
                inv.get('postingDate', ''),
                'PPI',
                'PPI',
                'false',
                'NATIONAL',
                '0',
                'Ouvert',
                inv.get('dueDate', ''),
                inv.get('paymentReference', ''),
                '',
            ]
            new_rows.append(self._build_row(row_num, values))
        
        new_content = before_data + ''.join(new_rows) + after_data
        
        with open(sheet_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
    
    def modify_line_sheet(self, invoices):
        """Modifie la feuille Ligne achat avec N° ligne incrémenté."""
        sheet_path = os.path.join(self.extract_dir, 'xl/worksheets/sheet2.xml')
        
        with open(sheet_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        match_before = re.search(r'^(.*?<x:row r="3">.*?</x:row>)', content, re.DOTALL)
        match_after = re.search(r'(</x:sheetData>.*?)$', content, re.DOTALL)
        
        if not match_before or not match_after:
            raise ValueError("Invalid template structure")
        
        before_data = match_before.group(1)
        after_data = match_after.group(1)
        
        new_rows = []
        for idx, inv in enumerate(invoices):
            row_num = 4 + idx
            amount = str(inv.get('amount', 0))
            line_no = str((idx + 1) * 10000)
            
            values = [
                'Facture',
                inv.get('documentNo', ''),
                line_no,
                inv.get('vendorNo', ''),
                'Compte général',
                inv.get('glAccount', ''),
                inv.get('postingDate', ''),
                inv.get('description', ''),
                '1',
                '1',
                amount,
                amount,
                '0',
                amount,
                amount,
                inv.get('dimension1', ''),
                inv.get('dimension2', ''),
                amount,
                inv.get('vendorNo', ''),
                '0',
                'NATIONAL',
                'DIVERS',
                'TVA normale',
                'NATIONAL',
                '0 %',
                amount,
                '0',
                amount,
                amount,
                amount,
                'TVA normale',
                amount,
                '0',
                '1',
                '1',
                '1',
                '1',
                inv.get('postingDate', ''),
            ]
            new_rows.append(self._build_row(row_num, values))
        
        new_content = before_data + ''.join(new_rows) + after_data
        
        with open(sheet_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
    
    def update_table_ref(self, table_path, new_last_row):
        """Met à jour la référence de la table."""
        full_path = os.path.join(self.extract_dir, table_path)
        if not os.path.exists(full_path):
            return
        
        with open(full_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        old_ref = re.search(r'ref="A3:([A-Z]+)(\d+)"', content)
        if old_ref:
            end_col = old_ref.group(1)
            new_ref = f'A3:{end_col}{new_last_row}'
            content = re.sub(r'ref="A3:[A-Z]+\d+"', f'ref="{new_ref}"', content)
            
            with open(full_path, 'w', encoding='utf-8') as f:
                f.write(content)
    
    def generate(self, invoices):
        """
        Génère le package Excel.
        
        Returns:
            bytes: Contenu du fichier Excel
        """
        self.modify_header_sheet(invoices)
        self.update_table_ref('xl/tables/table1.xml', 3 + len(invoices))
        
        self.modify_line_sheet(invoices)
        self.update_table_ref('xl/tables/table2.xml', 3 + len(invoices))
        
        # Créer le ZIP en mémoire
        output = BytesIO()
        with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as z:
            for root, dirs, files in os.walk(self.extract_dir):
                for file in files:
                    file_path = os.path.join(root, file)
                    arc_name = os.path.relpath(file_path, self.extract_dir)
                    z.write(file_path, arc_name)
        
        output.seek(0)
        return output.read()
    
    def cleanup(self):
        """Nettoie les fichiers temporaires."""
        import shutil
        if os.path.exists(self.extract_dir):
            shutil.rmtree(self.extract_dir)


class handler(BaseHTTPRequestHandler):
    """Handler Vercel pour la génération Excel."""
    
    def do_POST(self):
        try:
            # Lire le body
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body)
            
            invoices = data.get('invoices', [])
            template_base64 = data.get('template')
            
            if not invoices:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'No invoices provided'}).encode())
                return
            
            # Générer le package
            generator = BCPackageGenerator(template_base64=template_base64)
            excel_bytes = generator.generate(invoices)
            generator.cleanup()
            
            # Envoyer le fichier Excel
            self.send_response(200)
            self.send_header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            self.send_header('Content-Disposition', f'attachment; filename="BC_Package.xlsx"')
            self.send_header('Content-Length', str(len(excel_bytes)))
            self.end_headers()
            self.wfile.write(excel_bytes)
            
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode())
    
    def do_OPTIONS(self):
        """Handle CORS preflight."""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()