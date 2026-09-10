import { ArrowUpRight } from 'lucide-react';
import { CoverImage } from '../../components/ui';
import type { LibraryEntry } from '../../types/models';
import { associateLora } from './loraAssociations';

export function AssociatedLoras({
  names,
  library,
  loraDir,
  onOpen,
}: {
  names: string[];
  library: LibraryEntry[];
  loraDir: string;
  onOpen: (entry: LibraryEntry) => void;
}) {
  if (!names.length) return null;
  return (
    <section className="associated-loras" aria-label="关联模型库 LoRA">
      <h3>模型库中的 LoRA</h3>
      {names.map((name) => {
        const match = associateLora(name, library, loraDir);
        return (
          <div className="associated-lora-group" key={name}>
            <p className="associated-lora-source">{name}</p>
            <p className="field-help">
              {!match.candidates.length
                ? '模型库中未找到对应文件'
                : match.candidates.length > 1
                  ? '存在多个同名文件，请选择要查看的模型'
                  : match.basis === 'path'
                    ? '路径匹配'
                    : '文件名匹配，请核对模型版本'}
            </p>
            {match.candidates.map((entry) => (
              <button
                className="associated-lora-card"
                key={entry.id}
                onClick={() => onOpen(entry)}
                aria-label={`查看关联 LoRA ${entry.name}`}
              >
                <CoverImage cover={entry.cover} alt={entry.name} />
                <span>
                  <strong>{entry.name}</strong>
                  <small>
                    {[entry.baseModel, entry.version?.name, entry.missing ? '文件缺失' : '已收录']
                      .filter(Boolean)
                      .join(' · ')}
                  </small>
                  <small className="associated-lora-path">{entry.path}</small>
                </span>
                <ArrowUpRight size={17} />
              </button>
            ))}
          </div>
        );
      })}
    </section>
  );
}
