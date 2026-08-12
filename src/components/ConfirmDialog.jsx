import React from 'react';
import Modal from './Modal';

export default function ConfirmDialog({ isOpen, onClose, onConfirm, title, message }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title || 'Confirmar'} width="400px">
      <p style={{ marginBottom: '20px', lineHeight: 1.5 }}>{message}</p>
      <div className="modal-actions">
        <button className="btn-secondary" onClick={onClose}>Cancelar</button>
        <button className="btn-danger" onClick={() => { onConfirm(); onClose(); }}>Confirmar</button>
      </div>
    </Modal>
  );
}
